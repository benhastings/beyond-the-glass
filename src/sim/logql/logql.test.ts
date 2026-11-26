import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { containerHistories } from '../telemetry/history'
import { telemetryScenario } from '../telemetry/testing'
import { trace } from '../telemetry/traces'
import { logVolume, parseLogql, queryLogs } from './logql'

const OOM = () =>
  telemetryScenario([
    {
      at: '+20m',
      type: 'setMemoryLimit',
      namespace: 'ravenpost',
      deployment: 'ledger',
      container: 'ledger',
      limit: '128Mi',
    },
    { at: '+10m', type: 'injectErrors', namespace: 'ravenpost', service: 'api', rate: 0.3 },
  ])

describe('E8-04 LogQL', () => {
  acTest(
    'E8-04.AC1',
    'a pod’s lines from LogQL are the lines `kubectl logs` prints for the same pod and window',
    () => {
      const { sim } = OOM()
      sim.advance(30 * 60_000)
      const sh = createShell(sim)
      for (const pod of sim.cluster().list('Pod', { namespace: 'ravenpost' })) {
        const k = sh.run(`kubectl logs ${pod.metadata.name} -n ravenpost`)
        const kubectl =
          k.exitCode === 0 ? k.stdout.replace(/\n$/, '').split('\n').filter(Boolean) : []
        // kubectl logs shows the current run (or, while waiting to restart, the one that died).
        const cs = pod.status.containerStatuses?.[0]
        const started = cs?.state.running
          ? Date.parse(cs.state.running.startedAt) - sim.clock.epochMs
          : cs?.lastState.terminated?.startedAt
            ? Date.parse(cs.lastState.terminated.startedAt) - sim.clock.epochMs
            : 0
        const loki = queryLogs(
          sim,
          `{namespace="ravenpost", pod="${pod.metadata.name}"}`,
          started,
          sim.now,
        ).map((e) => e.line)
        expect(loki, pod.metadata.name).toEqual(kubectl)
      }
      // The previous run of an OOMKilled container: --previous and a window over that run agree too.
      const h = containerHistories(sim).find(
        (x) =>
          x.deployment === 'ledger' &&
          x.runs.some((r) => r.reason === 'OOMKilled') &&
          sim.cluster().get('Pod', 'ravenpost', x.pod),
      )
      const prev = h?.runs.filter((r) => r.end !== undefined).at(-1)
      const k = sh.run(`kubectl logs ${h?.pod ?? ''} -n ravenpost --previous`)
      expect(k.exitCode).toBe(0)
      const window = queryLogs(
        sim,
        `{pod="${h?.pod ?? ''}"}`,
        prev?.start ?? 0,
        prev?.end ?? 0,
      ).map((e) => e.line)
      expect(window).toEqual(k.stdout.replace(/\n$/, '').split('\n'))
    },
  )

  it('filters lines and JSON fields; the volume counts them; trace IDs resolve', () => {
    const { sim } = OOM()
    sim.advance(30 * 60_000)
    const all = queryLogs(sim, '{namespace="ravenpost", app="api"}', 0, sim.now)
    expect(all.length).toBeGreaterThan(50)
    expect(all.every((e) => e.labels.app === 'api')).toBe(true)
    const errors = queryLogs(
      sim,
      '{namespace="ravenpost", app="api"} | json | level="error"',
      0,
      sim.now,
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((e) => e.fields?.level === 'error' && e.t >= 10 * 60_000)).toBe(true)
    expect(queryLogs(sim, '{app="api"} |= "\\"level\\":\\"error\\""', 0, sim.now)).toHaveLength(
      errors.length,
    )
    expect(
      queryLogs(sim, '{app="api"} != "request" |~ "starting|listening"', 0, sim.now).every((e) =>
        /starting|listening/.test(e.line),
      ),
    ).toBe(true)
    expect(
      queryLogs(
        sim,
        '{app=~"api|gate"} | json | duration_ms >= 0 | status != 200',
        0,
        sim.now,
      ).every((e) => e.fields?.status !== '200'),
    ).toBe(true)
    expect(
      queryLogs(sim, '{app="api"} !~ "request"', 0, sim.now).every(
        (e) => !e.line.includes('request'),
      ),
    ).toBe(true)
    expect(queryLogs(sim, '{app="nope"}', 0, sim.now)).toEqual([])
    const withTrace = errors.find((e) => e.fields?.trace_id)
    expect(
      withTrace &&
        trace(sim, withTrace.fields?.trace_id ?? '')?.spans.some(
          (s) => s.spanId === withTrace.fields?.span_id,
        ),
    ).toBe(true)
    const vol = logVolume(all, 0, sim.now, 30)
    expect(vol).toHaveLength(30)
    expect(vol.reduce((n, b) => n + b.count, 0)).toBe(all.length)
    expect(vol[1]?.t).toBe(60_000)
  })

  it('refuses what isn’t available, quoting it', () => {
    const msg = (q: string) => {
      try {
        parseLogql(q)
      } catch (e) {
        return (e as Error).message
      }
      return ''
    }
    expect(msg('rate({app="api"}[5m])')).toBe(
      '"rate(" isn\'t available in this simulation — try the logs themselves, like {namespace="ravenpost"} |= "error"; for rates, use PromQL',
    )
    expect(msg('{app="api"} | logfmt')).toBe(
      '"| logfmt" isn\'t available in this simulation — try | json (the lines here are JSON)',
    )
    expect(msg('{app="api"} | json | line_format "{{.msg}}"')).toMatch(
      /^"\| line_format" isn't available/,
    )
    expect(msg('app="api"')).toMatch(/starts with a stream selector/)
    expect(msg('{host="x"}')).toBe(
      '"host" isn\'t a label here: try cluster, namespace, pod, container, app',
    )
    expect(msg('{app!="x"}')).toMatch(/needs a matcher that rules out the empty value/)
    expect(msg('{app="x"} | level="error"')).toBe(
      '"| level …" filters on a parsed field: put | json before it',
    )
    expect(msg('{app="x"} | json | duration_ms > "5"')).toBe(
      '> compares numbers: write duration_ms > 500',
    )
    expect(msg('{app="x"} |~ "("')).toBe('"(" isn\'t a valid regular expression')
    expect(msg('{app="x"} |= "oops')).toMatch(/unterminated string/)
    expect(msg('{app="x"} ~ "a"')).toMatch(/^unexpected "~ "a"" at position/)
    expect(parseLogql('{app=`a`} | json | n == 3').stages).toEqual([
      { type: 'json' },
      { type: 'field', field: 'n', op: '=', value: 3 },
    ])
  })
})
