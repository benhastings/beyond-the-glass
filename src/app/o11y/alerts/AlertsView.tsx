import { useMemo, useState } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import { evaluateRules, RULES, type AlertTimeline } from '@/sim/alerts/rules'
import {
  BURN_ALERTS,
  budgetConsumed,
  burnRate,
  DAY,
  errorBudget,
  timeToExhaust,
} from '@/sim/alerts/slo'
import { instantQuery } from '@/sim/promql/evaluate'
import { telemetrySource } from '@/sim/promql/source'
import { Button } from '../../ui/Button'
import { StatusPill } from '../../ui/StatusPill'
import { Tabs } from '../../ui/Tabs'
import { clockTime, formatValue } from '../format'

const HOUR = 3_600_000
const label = (l: Record<string, string>) =>
  Object.entries(l)
    .filter(([k]) => k !== 'cluster')
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')

/** The alert rules' state over the last hour, evaluated as Prometheus would (E8-07). */
export function useAlerts(sim: Simulator): AlertTimeline {
  return useMemo(() => evaluateRules(sim, sim.now - HOUR, sim.now), [sim])
}

/**
 * Alert rules (E8-07): each one's state now (firing, pending or inactive, as an icon and a word), its
 * expression, how long it must hold, what to do, and what it did over the last hour.
 */
export function AlertsView({ sim, alerts }: { sim: Simulator; alerts: AlertTimeline }) {
  const epoch = sim.clock.epochMs
  return (
    <section aria-label="Alerts" className="grid min-w-0 gap-3">
      <h3 className="text-xl font-bold">Alert rules</h3>
      <p className="max-w-prose text-sm">
        Each rule is a PromQL expression evaluated every 30 seconds. While it returns something, the
        alert is pending; once it has held for the rule’s “for” time, it fires.
      </p>
      <ul className="grid gap-3">
        {RULES.map((r) => {
          const mine = alerts.active.filter((a) => a.rule === r.name)
          const history = alerts.transitions.filter((x) => x.rule === r.name)
          const firing = mine.some((a) => a.state === 'firing')
          return (
            <li key={r.name} className="grid gap-2 rounded-sm border border-line bg-surface p-3">
              <p className="flex flex-wrap items-center gap-3">
                <span className="font-mono font-bold">{r.name}</span>
                {firing ? (
                  <StatusPill status="alert">Firing</StatusPill>
                ) : mine.length ? (
                  <StatusPill status="warn">Pending</StatusPill>
                ) : (
                  <StatusPill status="neutral">Inactive</StatusPill>
                )}
                <span className="text-sm text-ink-muted">severity: {r.labels.severity}</span>
              </p>
              <p className="text-sm">{r.annotations.summary}</p>
              {mine.length > 0 && (
                <ul className="grid gap-1 text-sm" aria-label={`${r.name}: active alerts`}>
                  {mine.map((a) => (
                    <li key={label(a.labels)} className="[overflow-wrap:anywhere]">
                      {a.state === 'firing' ? 'Firing' : 'Pending'} since{' '}
                      {clockTime(epoch, a.activeAt)} for {label(a.labels) || 'everything'} (value{' '}
                      {formatValue(a.value)})
                    </li>
                  ))}
                </ul>
              )}
              <details>
                <summary className="cursor-pointer text-sm font-bold">
                  Rule, runbook and history
                </summary>
                <dl className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere]">
                  <dt className="text-ink-muted">Expression</dt>
                  <dd>
                    <code className="font-mono">{r.expr}</code>
                  </dd>
                  <dt className="text-ink-muted">For</dt>
                  <dd>
                    {String(r.forMs / 60_000)} minute{r.forMs === 60_000 ? '' : 's'}
                  </dd>
                  <dt className="text-ink-muted">What to do</dt>
                  <dd>{r.annotations.description}</dd>
                  <dt className="text-ink-muted">Runbook</dt>
                  <dd className="font-mono">{r.annotations.runbook}</dd>
                </dl>
                {history.length ? (
                  <ol
                    className="mt-2 grid gap-1 text-sm"
                    aria-label={`${r.name}: changes in the last hour`}
                  >
                    {history.map((x, i) => (
                      <li key={i}>
                        {clockTime(epoch, x.t)}: {x.from} → {x.to} (
                        {label(x.labels) || 'everything'})
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-sm">No changes in the last hour.</p>
                )}
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const OBJECTIVE = 0.999
const WINDOWS = [
  { id: '5m', ms: 5 * 60_000 },
  { id: '30m', ms: 30 * 60_000 },
  { id: '1h', ms: HOUR },
  { id: '6h', ms: 6 * HOUR },
] as const

/** The gate's availability SLO (E8-07): its SLI over several windows, how fast the budget burns, and why. */
export function SloPanel({ sim }: { sim: Simulator }) {
  const data = useMemo(() => {
    const src = telemetrySource(sim)
    const ratio = (w: string) => {
      const v = instantQuery(
        src,
        `sum(rate(http_server_requests_total{service="gate", http_response_status_code=~"5.."}[${w}])) / sum(rate(http_server_requests_total{service="gate"}[${w}]))`,
        sim.now,
      )
      return v.kind === 'vector' ? (v.samples[0]?.value ?? 0) : 0
    }
    const fast = instantQuery(
      src,
      'sum(rate(http_server_request_duration_seconds_bucket{service="gate", le="0.5"}[1h])) / sum(rate(http_server_request_duration_seconds_count{service="gate"}[1h]))',
      sim.now,
    )
    const windows = WINDOWS.map((w) => ({ ...w, ratio: ratio(w.id) }))
    return { windows, fast: fast.kind === 'vector' ? (fast.samples[0]?.value ?? NaN) : NaN }
  }, [sim])
  const by = Object.fromEntries(data.windows.map((w) => [w.id, w])) as Record<
    (typeof WINDOWS)[number]['id'],
    (typeof data.windows)[number]
  >
  const burn = (id: (typeof WINDOWS)[number]['id']) => burnRate(by[id].ratio, OBJECTIVE)
  const page1 = BURN_ALERTS[0]
  const page6 = BURN_ALERTS[1]
  const paging =
    (burn('1h') > page1.threshold && burn('5m') > page1.threshold) ||
    (burn('6h') > page6.threshold && burn('30m') > page6.threshold)
  const spent6h = budgetConsumed(burn('6h'), 6 * HOUR, 30 * DAY)
  const lasts = timeToExhaust(burn('1h'), 30 * DAY)
  return (
    <section aria-label="Service level objectives" className="grid min-w-0 gap-3">
      <h3 className="text-xl font-bold">Gate availability SLO: 99.9%</h3>
      <div className="w-0 min-w-full overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Gate availability over recent windows</caption>
          <thead>
            <tr className="border-b border-line">
              {['Window', 'Requests that succeeded', 'Burn rate'].map((h) => (
                <th key={h} scope="col" className="p-2">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.windows.map((w) => (
              <tr key={w.id} className="border-b border-line">
                <th scope="row" className="p-2 font-normal">
                  Last {w.id}
                </th>
                <td className="p-2">{formatValue(1 - w.ratio, 'percent')}</td>
                <td className="p-2">{burnRate(w.ratio, OBJECTIVE).toFixed(1)}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap items-center gap-2">
        {paging ? (
          <StatusPill status="alert">Burning fast enough to page</StatusPill>
        ) : burn('1h') > 1 ? (
          <StatusPill status="warn">Faster than planned, below the paging thresholds</StatusPill>
        ) : (
          <StatusPill status="ok">Within budget pace</StatusPill>
        )}
        <span className="text-sm">
          The last six hours spent {formatValue(spent6h, 'percent')} of a 30-day budget.
          {Number.isFinite(lasts)
            ? ` At the last hour’s pace, a full budget lasts ${lasts >= 2 * DAY ? `${String(Math.round(lasts / DAY))} days` : `${String(Math.round(lasts / HOUR))} hours`}.`
            : ' Nothing failed in the last hour.'}
        </span>
      </p>
      <p className="text-sm">
        Latency SLO: 95% of requests within 500 ms. Last hour: {formatValue(data.fast, 'percent')}.
      </p>
      <Tabs
        label="How to read this"
        items={[
          {
            id: 'eli5',
            label: 'ELI5',
            content: (
              <p className="max-w-prose text-sm">
                The promise is that 999 requests in every 1,000 work. That leaves 1 in 1,000 allowed
                to fail: the error budget. The burn rate says how fast that allowance is being used.
                1× uses it at exactly the planned pace; 14× would use a month’s allowance in about
                two days, which is why it wakes someone up.
              </p>
            ),
          },
          {
            id: 'operator',
            label: 'Operator',
            content: (
              <p className="max-w-prose text-sm">
                Error budget = 1 − objective = {formatValue(errorBudget(OBJECTIVE), 'percent')}.
                Burn rate = error ratio ÷ budget. The page fires when both the 1 h and 5 m windows
                burn above 14.4× (2% of a 30-day budget in an hour), or both 6 h and 30 m above 6×
                (5% in six hours). Requiring the short window too means the alert clears soon after
                the fix, instead of an hour later.
              </p>
            ),
          },
        ]}
      />
    </section>
  )
}

/**
 * The pager (E8-07): page-severity alerts firing now, as a banner. No sound; the icon pulses only for
 * readers who haven't asked for reduced motion. Acknowledging hides it until a new page arrives.
 */
export function Pager({
  sim,
  alerts,
  onOpen,
}: {
  sim: Simulator
  alerts: AlertTimeline
  onOpen?: () => void
}) {
  const pages = alerts.active.filter(
    (a) => a.state === 'firing' && RULES.find((r) => r.name === a.rule)?.labels.severity === 'page',
  )
  const key = pages.map((p) => `${p.rule}@${String(p.activeAt)}`).join('|')
  const [acked, setAcked] = useState('')
  if (pages.length === 0 || acked === key) return null
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-md border-2 border-alert bg-raised p-3"
    >
      <span aria-hidden="true" className="text-xl text-alert motion-safe:animate-pulse">
        ●
      </span>
      <p className="grow">
        <span className="font-bold">Paged:</span>{' '}
        {pages
          .map((p) => `${p.rule} (firing since ${clockTime(sim.clock.epochMs, p.activeAt)})`)
          .join('; ')}
      </p>
      {onOpen && (
        <Button variant="primary" onClick={onOpen}>
          See alerts
        </Button>
      )}
      <Button
        onClick={() => {
          setAcked(key)
        }}
      >
        Acknowledge
      </Button>
    </div>
  )
}
