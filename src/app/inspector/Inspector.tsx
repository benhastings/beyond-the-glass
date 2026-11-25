import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { auditLog } from '@/sim/controllers'
import { transcript } from '@/sim/commands'
import { replayTo } from '@/sim/commands/replay'
import { Button } from '../ui'
import { inspected, onInspect } from './registry'

/**
 * `?inspector=1` in a dev build (E6-13): the current simulation's state, a timeline scrubber that replays
 * the scenario and the learner's commands to any moment, the audit log, objective results, and a button
 * to copy the snapshot. Imported only behind `import.meta.env.DEV`, so production builds don't contain it.
 */
export default function Inspector() {
  const target = useSyncExternalStore(onInspect, inspected)
  // Re-render once a second so the live state stays current.
  const [, setTick] = useState(0)
  const [at, setAt] = useState<number>()
  const [copied, setCopied] = useState('')
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((n) => n + 1)
    }, 1000)
    return () => {
      window.clearInterval(id)
    }
  }, [])
  const now = target?.sim.now ?? 0
  const scrubbed = useMemo(
    () =>
      target && at !== undefined
        ? replayTo(target.scenario, at, transcript(target.sim).log ?? [])
        : undefined,
    [target, at],
  )
  if (!target)
    return (
      <aside data-testid="btg-sim-inspector" className="p-2 font-mono text-xs">
        Sim inspector: no terminal open.
      </aside>
    )
  const sim = scrubbed ?? target.sim
  const evaluation = target.run?.evaluate()
  return (
    <aside
      data-testid="btg-sim-inspector"
      aria-label="Sim inspector"
      className="fixed right-0 bottom-0 z-50 max-h-[50vh] w-[min(36rem,100vw)] overflow-auto border border-line bg-raised p-3 font-mono text-xs"
    >
      <h2 className="font-bold">Sim inspector · {target.scenario.id}</h2>
      <label className="mt-2 block">
        Time: {Math.round((at ?? now) / 1000)} s of {Math.round(now / 1000)} s
        {at !== undefined ? ' (replayed)' : ''}
        <input
          type="range"
          min={0}
          max={now}
          step={1000}
          value={at ?? now}
          onChange={(e) => {
            const v = Number(e.target.value)
            setAt(v >= now ? undefined : v)
          }}
          className="block w-full"
        />
      </label>
      <Button
        onClick={() => {
          void navigator.clipboard.writeText(JSON.stringify(sim.snapshot())).then(() => {
            setCopied('Snapshot copied.')
          })
        }}
      >
        Copy snapshot
      </Button>
      <span role="status">{copied}</span>
      {evaluation && (
        <details open>
          <summary>Objectives</summary>
          <ul>
            {evaluation.objectives.map((o) => (
              <li key={o.id}>
                {o.done ? '✓' : '○'} {o.id}
              </li>
            ))}
          </ul>
        </details>
      )}
      <details>
        <summary>Audit log ({auditLog(sim).length})</summary>
        <ol>
          {auditLog(sim).map((e, i) => (
            <li key={i}>
              {Math.round(e.t / 1000)}s {e.actor} {e.verb} {e.kind}/{e.name}
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary>State</summary>
        <pre>{JSON.stringify(sim.snapshot().clusters, null, 1)}</pre>
      </details>
    </aside>
  )
}
