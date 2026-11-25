import ravenpost from '@/scenarios/ravenpost.yaml'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { loadSimulation } from '../controllers'
import { scenarioSchema } from '../core/scenario'
import { miniScenarioInput } from '../core/testing'
import { logsInWindow } from '../telemetry/logs'
import { createShell } from './index'

const ravenShell = () => {
  const sim = loadSimulation(ravenpost)
  const sh = createShell(sim)
  const names = sh
    .run('kubectl get pods -n ravenpost -o name')
    .stdout.split('\n')
    .map((n) => n.slice(4))
  const pod = (prefix: string) => names.find((n) => n.startsWith(prefix)) ?? ''
  return { sim, sh, notifier: pod('ravenpost-notifier'), api: pod('ravenpost-api') }
}

/** The mini cluster with a second container (a log shipper sidecar) in each web pod. */
function sidecarShell() {
  const base = miniScenarioInput()
  const c0 = structuredClone(base.clusters[0]) as NonNullable<typeof base.clusters>[number]
  for (const r of c0.resources ?? [])
    if (r.kind === 'Deployment')
      r.spec.template.spec.containers.push({
        name: 'log-shipper',
        image: 'registry.example/shipper:1.0',
      })
  const sim = loadSimulation(scenarioSchema.parse({ ...base, clusters: [c0] }))
  sim.advance(30_000)
  const sh = createShell(sim)
  const pod = sh.run('kubectl get pods -n shop -o name').stdout.split('\n')[0]?.slice(4) ?? ''
  return { sh, pod }
}

describe('E6-06 kubectl logs', () => {
  acTest(
    'E6-06.AC1',
    '--previous shows the crashed container’s last lines, and errors when there is none',
    () => {
      const { sh, notifier, api } = ravenShell()
      const prev = sh.run(`kubectl logs ${notifier} -n ravenpost --previous`)
      expect(prev.exitCode).toBe(0)
      const lines = prev.stdout.split('\n')
      expect(lines[0]).toMatch(/"msg":"starting notifier"/)
      expect(lines.at(-1)).toBe(
        '{"level":"fatal","msg":"notifier cannot start without a mail relay","exit_code":1}',
      )
      expect(prev.stdout).toMatch(/SMTP relay unreachable/)
      expect(sh.run(`kubectl logs ${notifier} -n ravenpost -p --tail=1`).stdout).toMatch(
        /"level":"fatal"/,
      )
      // A container that has never restarted has no previous instance.
      expect(sh.run(`kubectl logs ${api} -n ravenpost --previous`)).toEqual({
        stdout: '',
        stderr: `Error from server (BadRequest): previous terminated container "api" in pod "${api}" not found`,
        exitCode: 1,
      })
    },
  )

  acTest(
    'E6-06.AC2',
    'a pod with two containers and no -c gets kubectl’s default-container notice',
    () => {
      const { sh, pod } = sidecarShell()
      const out = sh.run(`kubectl logs ${pod} -n shop`)
      expect(out.exitCode).toBe(0)
      expect(out.stderr).toBe('Defaulted container "web" out of: web, log-shipper')
      expect(out.stdout).toMatch(/"msg":"request"/)
      // Naming the container removes the notice; an unknown name is kubectl's BadRequest.
      expect(sh.run(`kubectl logs ${pod} -n shop -c log-shipper`)).toMatchObject({
        stderr: '',
        exitCode: 0,
      })
      expect(sh.run(`kubectl logs ${pod} -n shop -c nope`)).toMatchObject({
        stderr: `Error from server (BadRequest): container "nope" is not valid for pod "${pod}"`,
        exitCode: 1,
      })
      expect(sh.run(`kubectl logs ${pod} -n shop --all-containers --prefix`).stdout).toMatch(
        new RegExp(`^\\[pod/${pod}/log-shipper\\] `, 'm'),
      )
    },
  )

  acTest(
    'E6-06.AC3',
    'kubectl logs prints exactly the lines the log explorer’s window query returns',
    () => {
      const { sim, sh, api, notifier } = ravenShell()
      for (const [pod, c] of [
        [api, 'api'],
        [notifier, 'notifier'],
      ] as const) {
        const p = sim.cluster().get('Pod', 'ravenpost', pod)
        if (!p) throw new Error(pod)
        for (const [window, ms] of [
          ['5m', 300_000],
          ['20m', 1_200_000],
          ['1h', 3_600_000],
        ] as const) {
          const out = sh.run(`kubectl logs ${pod} -n ravenpost --since=${window}`).stdout
          const fromRun = logsInWindow(sim, p, c, sim.now - ms, sim.now).filter((l) => {
            // kubectl logs (without -p) reads the current run only.
            const cs = p.status.containerStatuses?.[0]
            const started =
              cs?.state.running?.startedAt ?? cs?.lastState.terminated?.startedAt ?? ''
            return l.t >= Date.parse(started) - sim.clock.epochMs
          })
          expect(out, `${pod} --since=${window}`).toBe(fromRun.map((l) => l.text).join('\n'))
        }
      }
    },
  )

  it('supports --tail, --since, --timestamps, deploy/NAME, -l and -f', () => {
    const { sim, sh, api } = ravenShell()
    expect(sh.run(`kubectl logs ${api} -n ravenpost --tail=2`).stdout.split('\n')).toHaveLength(2)
    expect(sh.run(`kubectl logs ${api} -n ravenpost --tail=1 --timestamps`).stdout).toMatch(
      /^2026-03-14T\d\d:\d\d:\d\d\.\d{9}Z \{/,
    )
    expect(sh.run(`kubectl logs ${api} -n ravenpost --since=1m`).stdout.split('\n')).toHaveLength(2)
    const deploy = sh.run('kubectl logs deploy/ravenpost-api -n ravenpost --tail=1')
    expect(deploy.stderr).toBe(`Found 3 pods, using pod/${api}`)
    const sel = sh.run('kubectl logs -l app=ravenpost-web -n ravenpost --prefix')
    expect(sel.stdout.split('\n')).toHaveLength(20)
    const before = sim.now
    const follow = sh.run(`kubectl logs ${api} -n ravenpost --tail=0 -f`)
    expect(sim.now - before).toBe(30_000)
    expect(follow.stdout.split('\n')).toHaveLength(1)
    expect(sh.run('kubectl logs nope -n ravenpost').stderr).toBe(
      'Error from server (NotFound): pods "nope" not found',
    )
    expect(sh.run('kubectl logs -n ravenpost').stderr).toMatch(
      /POD or TYPE\/NAME is a required argument/,
    )
    expect(sh.run(`kubectl logs ${api} -n ravenpost --tail=x`).exitCode).toBe(1)
    expect(sh.run(`kubectl logs ${api} -n ravenpost --since=soon`).exitCode).toBe(1)
  })

  it('explains a container that hasn’t started', () => {
    const base = miniScenarioInput()
    const sim = loadSimulation(
      scenarioSchema.parse({
        ...base,
        timeline: [
          {
            at: '+10s',
            type: 'setImage',
            deployment: 'web',
            namespace: 'shop',
            container: 'web',
            image: 'registry.example/web:missing',
            behaviour: { pull: 'notFound' },
          },
        ],
      }),
    )
    sim.advance(60_000)
    const sh = createShell(sim)
    const bad = sh
      .run('kubectl get pods -n shop -o name')
      .stdout.split('\n')
      .map((n) => n.slice(4))
    const outs = bad.map((p) => sh.run(`kubectl logs ${p} -n shop`))
    expect(
      outs.some((o) => /is waiting to start: trying and failing to pull image/.test(o.stderr)),
    ).toBe(true)
  })
})

describe('E6-06 kubectl events and top', () => {
  it('kubectl events lists oldest first with repeats, filters by --for and --types', () => {
    const { sh, notifier } = ravenShell()
    const all = sh.run('kubectl events -n ravenpost').stdout.split('\n')
    expect(all[0]).toMatch(/^LAST SEEN +TYPE +REASON +OBJECT +MESSAGE$/)
    expect(all[1]).toMatch(/Scheduled/)
    expect(sh.run('kubectl events -n ravenpost').stdout).toMatch(
      /\(x36 over 2\dm\) +Warning +BackOff +Pod\/ravenpost-notifier/,
    )
    expect(sh.run('kubectl events -n ravenpost --types=Warning').stdout.split('\n')).toHaveLength(2)
    expect(
      sh.run(`kubectl events -n ravenpost --for pod/${notifier}`).stdout.split('\n'),
    ).toHaveLength(6)
    expect(sh.run('kubectl events -A --no-headers').stdout).toMatch(/^ravenpost +/)
    expect(sh.run('kubectl events -n shop').stderr).toBe('No events found in shop namespace.')
    expect(sh.run('kubectl events --types=Info').exitCode).toBe(1)
  })

  it('kubectl top reports the scenario’s usage', () => {
    const { sh } = ravenShell()
    const pods = sh.run('kubectl top pods -n ravenpost --sort-by=cpu').stdout.split('\n')
    expect(pods[0]).toMatch(/^NAME +CPU\(cores\) +MEMORY\(bytes\)$/)
    expect(pods[1]).toMatch(/^ravenpost-worker-\S+ +35m +141Mi$/)
    // The crash-looping notifier has no running container, so metrics-server has nothing for it.
    expect(pods.some((l) => l.startsWith('ravenpost-notifier'))).toBe(false)
    expect(
      sh.run('kubectl top pods -n ravenpost --containers -l app=ravenpost-web').stdout,
    ).toMatch(/ web +4m +58Mi$/m)
    expect(sh.run('kubectl top nodes').stdout.split('\n')[0]).toMatch(
      /^NAME +CPU\(cores\) +CPU\(%\) +MEMORY\(bytes\) +MEMORY\(%\)$/,
    )
    expect(sh.run('kubectl top node nope').exitCode).toBe(1)
    expect(sh.run('kubectl top pods -n ravenpost --sort-by=disk').exitCode).toBe(1)
    expect(sh.run('kubectl top services').exitCode).toBe(1)
  })
})
