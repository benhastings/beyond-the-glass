import {
  startTransition,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { SCENARIOS } from '@/scenarios'
import { CapstoneRun, type View } from '@/sim/capstone/engine'
import { holds } from '@/sim/capstone/script'
import { parseDuration } from '@/sim/core/duration'
import { transcript } from '@/sim/commands'
import { loadSimulation, restoreSimulation } from '@/sim/controllers'
import type { Scenario } from '@/sim/core/scenario'
import type { Simulator } from '@/sim/core/simulator'
import { ArgoConsole } from '../gitops/argo/ArgoConsole'
import { MergeRequestFlow } from '../gitops/MergeRequestFlow'
import { DashboardView } from '../o11y/dashboards/DashboardView'
import { LogsExplorer } from '../o11y/logs/LogsExplorer'
import { TraceExplorer } from '../o11y/traces/TraceExplorer'
import { useProgress } from '../progress'
import { Terminal } from '../terminal/Terminal'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { RadioGroup } from '../ui/RadioGroup'
import { StatusPill } from '../ui/StatusPill'
import { Tabs } from '../ui/Tabs'
import { SmallScreenNote } from '../ui/SmallScreenNote'
import { cx, focusRing } from '../ui/styles'
import { Debrief } from './Debrief'
import {
  bringUp,
  loadLayout,
  PANES,
  saveLayout,
  visiblePanes,
  type Layout,
  type PaneId,
} from './layout'

const storage = () => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** Wide enough for panes side by side (1024 px); narrower, the panes become tabs. */
function useWide(): boolean {
  const query = '(min-width: 1024px)'
  return useSyncExternalStore(
    (cb) => {
      if (typeof window.matchMedia !== 'function') return () => undefined
      const m = window.matchMedia(query)
      m.addEventListener('change', cb)
      return () => {
        m.removeEventListener('change', cb)
      }
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true),
  )
}

function resume(scenario: Scenario, snapshot: unknown): Simulator {
  if (snapshot !== undefined)
    try {
      return restoreSimulation(scenario, snapshot)
    } catch {
      // A snapshot from an older version of the scenario: start the night again.
    }
  return loadSimulation(scenario)
}

const STORM = [
  'The storm is at its height.',
  'The storm is easing.',
  'The rain is thinning.',
  'The last of the storm is passing.',
  'The storm has passed.',
]

/**
 * The war room (E10-04): the incident, a terminal, Argo CD, merge requests, dashboards, logs and traces,
 * and notes, as panes. Two or three side by side (or one, maximized); tabs on narrow screens. Every pane
 * is a landmark with a heading; Alt+1–7 jump to them, ? lists the shortcuts. The layout is remembered.
 */
export default function WarRoom({ backgroundClock = true }: { backgroundClock?: boolean }) {
  const scenario = SCENARIOS['the-long-night']
  if (!scenario) throw new Error('no the-long-night scenario')
  const id = useId()
  const saveScenario = useProgress((s) => s.saveScenario)
  const saved = useProgress.getState().progress.scenarios[scenario.id]
  const [sim] = useState(() => resume(scenario, saved?.snapshot))
  const [run] = useState(() => {
    const r = new CapstoneRun(sim)
    r.start()
    return r
  })
  const [notes, setNotes] = useState(saved?.notes ?? '')
  const [, setVersion] = useState(0)
  const [hint, setHint] = useState<string>()
  const [announce, setAnnounce] = useState('')
  const [help, setHelp] = useState(false)
  const [layout, setLayoutState] = useState<Layout>(() => loadLayout(storage()))
  const [tab, setTab] = useState<PaneId>('incident')
  const [trace, setTrace] = useState<{ traceId: string; spanId?: string }>()
  const [explore, setExplore] = useState('traces')
  const wide = useWide()
  const setLayout = (l: Layout, { deferred = false } = {}) => {
    // Bringing a pane up by shortcut is a transition: a heavy pane (dashboards) renders in pieces, not
    // one long task (E11-02). The layout controls themselves update at once.
    if (deferred)
      startTransition(() => {
        setLayoutState(l)
      })
    else setLayoutState(l)
    saveLayout(storage(), l)
  }
  const changed = () => {
    const before = run.actIndex
    run.tick()
    if (run.actIndex !== before) {
      const act = run.current
      setAnnounce(
        act
          ? `${act.clock}: ${act.title}. ${act.narrative}`
          : 'The night is over. Your debrief is at the top of the war room.',
      )
      setHint(undefined)
    }
    setVersion((v) => v + 1)
    saveScenario(scenario.id, { snapshot: sim.snapshot(), act: run.actIndex, notes })
  }
  // The night is over: recorded once (the map's badge, and the progress code).
  const finished = run.finished
  useEffect(() => {
    if (finished && !useProgress.getState().progress.scenarios[scenario.id]?.completedAt)
      saveScenario(scenario.id, { completedAt: new Date().toISOString() })
  }, [finished, saveScenario, scenario.id])
  // What's on screen counts as looking (found vs missed, in the debrief).
  const onScreen = wide ? visiblePanes(layout) : [tab]
  useEffect(() => {
    for (const p of onScreen) {
      const view: View | undefined =
        p === 'explore'
          ? explore === 'logs'
            ? 'logs'
            : 'traces'
          : p === 'argo' || p === 'dashboards' || p === 'changes'
            ? p
            : undefined
      if (view) run.viewed(view)
    }
  })
  // The gentle background clock: the incident moves on a little while you read.
  useEffect(() => {
    if (!backgroundClock) return
    const t = window.setInterval(() => {
      if (run.finished) return
      run.idle(15_000)
      changed()
    }, 5000)
    return () => {
      window.clearInterval(t)
    }
  })
  // The pane to focus once it has rendered (bringing it up is a transition, so it may take a moment).
  const [focusTarget, setFocusTarget] = useState<PaneId>()
  useEffect(() => {
    if (!focusTarget) return
    const el = document.getElementById(`${id}-${focusTarget}`)
    if (el) {
      el.focus()
      setFocusTarget(undefined)
    }
    // Again whenever the layout or tab changes, until the pane is there.
  }, [focusTarget, id, layout, tab])
  const focusPane = (pane: PaneId) => {
    if (wide) setLayout(bringUp(layout, pane), { deferred: true })
    else
      startTransition(() => {
        setTab(pane)
      })
    setFocusTarget(pane)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)
      if (e.altKey && /^Digit[1-7]$/.test(e.code)) {
        const pane = PANES[Number(e.code.slice(5)) - 1]
        if (pane) {
          e.preventDefault()
          focusPane(pane.id)
        }
      } else if (e.altKey && e.code === 'KeyM' && wide) {
        e.preventDefault()
        const inPane = (document.activeElement?.closest('[data-pane]')?.getAttribute('data-pane') ??
          visiblePanes(layout)[0]) as PaneId
        setLayout(
          layout.maximized ? { ...layout, maximized: undefined } : { ...layout, maximized: inPane },
        )
      } else if (e.key === '?' && !typing && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setHelp(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  })

  const act = run.current
  const remaining = run.acts.length - run.scores().filter((s) => s.over).length
  const pane = (p: PaneId): ReactNode => {
    switch (p) {
      case 'incident':
        return (
          <IncidentPane
            run={run}
            onHint={() => {
              setHint(run.hint())
              changed()
            }}
            hint={hint}
            onDiagnose={(actId, option) => {
              run.diagnose(actId, option)
              changed()
            }}
            storm={STORM[Math.min(STORM.length - 1, run.acts.length - remaining)] ?? ''}
          />
        )
      case 'terminal':
        return (
          <Terminal
            sim={sim}
            label="War room terminal"
            headingLevel={3}
            onChange={() => {
              const last = transcript(sim).entries.at(-1)
              if (last) run.record(last.command)
              changed()
            }}
          />
        )
      case 'argo':
        return <ArgoConsole sim={sim} onChange={changed} level={3} />
      case 'changes':
        return (
          <MergeRequestFlow
            sim={sim}
            repo="ravenpost-deploy"
            app="ravenpost"
            onChange={changed}
            level={3}
          />
        )
      case 'dashboards':
        return (
          <DashboardView
            sim={sim}
            headingLevel={3}
            onOpenTrace={(traceId) => {
              setTrace({ traceId })
              focusPane('explore')
            }}
          />
        )
      case 'explore':
        return (
          <Tabs
            label="Explore"
            value={explore}
            onValueChange={setExplore}
            items={[
              {
                id: 'traces',
                label: 'Traces',
                content: (
                  <TraceExplorer
                    key={trace?.traceId ?? ''}
                    sim={sim}
                    {...(trace ? { open: trace } : {})}
                    level={3}
                  />
                ),
              },
              {
                id: 'logs',
                label: 'Logs',
                content: (
                  <LogsExplorer
                    sim={sim}
                    onOpenTrace={(traceId, spanId) => {
                      setTrace({ traceId, ...(spanId ? { spanId } : {}) })
                    }}
                    level={3}
                  />
                ),
              },
            ]}
          />
        )
      case 'notes':
        return (
          <label className="grid gap-1">
            <span>
              What you know, what you’ve ruled out, what you did (kept with your progress)
            </span>
            <textarea
              className={cx(
                'min-h-64 rounded-md border border-line bg-surface p-2 font-mono text-sm',
                focusRing,
              )}
              maxLength={4000}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value)
                saveScenario(scenario.id, { notes: e.target.value })
              }}
            />
          </label>
        )
    }
  }
  const section = (p: PaneId, extra?: ReactNode) => {
    const title = PANES.find((x) => x.id === p)?.title ?? p
    const n = PANES.findIndex((x) => x.id === p) + 1
    return (
      <section
        key={p}
        data-pane={p}
        aria-labelledby={`${id}-${p}`}
        className="grid min-w-0 content-start gap-3 rounded-sm border border-line bg-surface p-3"
      >
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 id={`${id}-${p}`} tabIndex={-1} className={cx('text-lg font-bold', focusRing)}>
            {title} <span className="text-sm font-normal text-ink-muted">(Alt+{n})</span>
          </h2>
          {extra}
        </header>
        {pane(p)}
      </section>
    )
  }
  const shown = visiblePanes(layout)
  return (
    <div className="relative grid min-w-0 gap-3" data-testid="btg-war-room">
      {/* The storm: decoration only (the incident pane says how it's going); it eases as acts end. */}
      <div
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute inset-0 -z-10 rounded-lg bg-gradient-to-b from-stormwatch-panel to-transparent motion-safe:animate-pulse',
          ['opacity-0', 'opacity-20', 'opacity-35', 'opacity-50', 'opacity-70'][
            Math.min(4, remaining)
          ],
        )}
      />
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <SmallScreenNote what="The war room" />
      {finished && <Debrief run={run} notes={notes} exemplar={scenario.exemplarNote} />}
      {act && (
        <p className="flex flex-wrap items-center gap-2">
          <StatusPill status="alert">{`${act.clock} · ${act.title}`}</StatusPill>
          <span className="text-sm">
            Act {run.actIndex + 1} of {run.acts.length}
          </span>
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        {wide && (
          <>
            <RadioGroup
              legend="Layout"
              value={layout.preset}
              onValueChange={(v) => {
                setLayout({
                  ...layout,
                  preset: v === '3-up' ? '3-up' : '2-up',
                  maximized: undefined,
                })
              }}
              options={[
                { value: '2-up', label: 'Two panes' },
                { value: '3-up', label: 'Three panes' },
              ]}
            />
            {!layout.maximized &&
              shown.map((p, i) => (
                <label key={i} className="grid gap-1 text-sm">
                  Pane {i + 1}
                  <select
                    className={cx(
                      'min-h-11 rounded-md border border-line bg-surface px-2',
                      focusRing,
                    )}
                    value={p}
                    onChange={(e) => {
                      const slots = [...layout.slots] as Layout['slots']
                      slots[i] = e.target.value as PaneId
                      setLayout({ ...layout, slots })
                    }}
                  >
                    {PANES.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </>
        )}
        <Dialog
          title="Keyboard shortcuts"
          open={help}
          onOpenChange={setHelp}
          trigger={<Button variant="ghost">Keyboard shortcuts (?)</Button>}
        >
          <ul className="grid gap-1">
            {PANES.map((p, i) => (
              <li key={p.id}>
                <kbd className="font-mono">Alt+{i + 1}</kbd>: {p.title}
              </li>
            ))}
            <li>
              <kbd className="font-mono">Alt+M</kbd>: maximize the pane you’re in, or restore the
              layout
            </li>
            <li>
              <kbd className="font-mono">?</kbd>: this list
            </li>
          </ul>
        </Dialog>
      </div>
      {wide ? (
        <div
          className={cx(
            'grid gap-3',
            layout.maximized
              ? 'grid-cols-1'
              : layout.preset === '3-up'
                ? 'grid-cols-3'
                : 'grid-cols-2',
          )}
        >
          {shown.map((p) =>
            section(
              p,
              <Button
                variant="ghost"
                aria-pressed={layout.maximized === p}
                onClick={() => {
                  setLayout(
                    layout.maximized
                      ? { ...layout, maximized: undefined }
                      : { ...layout, maximized: p },
                  )
                }}
              >
                {layout.maximized === p ? 'Restore' : 'Maximize'}
                <span className="sr-only"> {PANES.find((x) => x.id === p)?.title}</span>
              </Button>,
            ),
          )}
        </div>
      ) : (
        <Tabs
          label="War room panes"
          value={tab}
          onValueChange={(v) => {
            setTab(v as PaneId)
          }}
          items={PANES.map((p) => ({ id: p.id, label: p.title, content: section(p.id) }))}
        />
      )}
    </div>
  )
}

function IncidentPane({
  run,
  hint,
  onHint,
  onDiagnose,
  storm,
}: {
  run: CapstoneRun
  hint: string | undefined
  onHint: () => void
  onDiagnose: (act: string, option: string) => void
  storm: string
}) {
  const act = run.current
  const scores = run.scores()
  // Until the act's trouble has had time to show, "Done" would only mean "hasn't broken yet".
  const settled =
    act !== undefined &&
    run.sim.now - (scores[run.actIndex]?.startedAt ?? 0) >= parseDuration(act.minDuration)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const unanswered = run.acts.filter(
    (a, i) => a.diagnosis && scores[i]?.over && scores[i].diagnosis?.answer === undefined,
  )
  return (
    <div className="grid gap-3">
      <p className="text-sm">{storm}</p>
      {act ? (
        <>
          <p className="font-bold">
            {act.clock} · {act.title}
          </p>
          <p>{act.narrative}</p>
          <ul aria-label="Objectives" className="grid gap-1">
            {act.objectives.map((o) => {
              const done = settled && holds(run.sim, o.check, run.history)
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  {done ? (
                    <StatusPill status="ok">Done</StatusPill>
                  ) : (
                    <StatusPill status="neutral">Not yet</StatusPill>
                  )}
                  {o.text}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onHint}>Hint</Button>
            {hint && (
              <p role="status" className="text-sm">
                {hint}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="font-bold">The night is over. Your debrief is ready.</p>
      )}
      {unanswered.map((a) => (
        <form
          key={a.id}
          className="grid gap-2 rounded-md border border-line p-2"
          onSubmit={(e) => {
            e.preventDefault()
            const c = choice[a.id]
            if (c) onDiagnose(a.id, c)
          }}
        >
          <RadioGroup
            legend={`${a.title}: ${a.diagnosis?.question ?? ''}`}
            value={choice[a.id] ?? ''}
            onValueChange={(v) => {
              setChoice((x) => ({ ...x, [a.id]: v }))
            }}
            options={(a.diagnosis?.options ?? []).map((o) => ({ value: o.id, label: o.text }))}
          />
          <div>
            <Button type="submit">Record my answer</Button>
          </div>
        </form>
      ))}
    </div>
  )
}
