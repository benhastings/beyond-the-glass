import { useId, useState, type ReactNode } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import {
  application,
  applications,
  refresh,
  sync,
  syncPreview,
  type Application,
  type SyncPreviewRow,
} from '@/sim/gitops/argo'
import { repo } from '@/sim/gitops/git'
import { nodeDetails, resourceTree, type TreeNode } from '@/sim/gitops/tree'
import { Button } from '../../ui/Button'
import { Checkbox } from '../../ui/Checkbox'
import { Dialog } from '../../ui/Dialog'
import { Tabs } from '../../ui/Tabs'
import { HealthPill, KIND_SHORT, SyncPill } from './status'
import { ResourceTree } from './ResourceTree'

const when = (sim: Simulator, t: number) =>
  new Date(sim.clock.epochMs + t).toISOString().replace('.000Z', 'Z').replace('T', ' ')
const pre =
  'overflow-x-auto rounded-md bg-term-ground p-3 font-mono text-sm text-term-ink whitespace-pre'

/**
 * An Argo CD–style console over the simulated Argo CD (E7-05): applications as tiles or a list, then one
 * application's resource tree (or table), node details, and Refresh, Sync and History and rollback. It
 * evokes Argo CD's layout without its logo or branding. `onChange` runs after anything that changes the
 * simulation, so the host can save it.
 */
export function ArgoConsole({
  sim,
  onChange,
  level = 2,
}: {
  sim: Simulator
  onChange?: () => void
  level?: 2 | 3
}) {
  const [open, setOpen] = useState<string>()
  const [, setVersion] = useState(0)
  const changed = () => {
    setVersion((v) => v + 1)
    onChange?.()
  }
  const app = open ? application(sim, open) : undefined
  return app ? (
    <AppDetails
      sim={sim}
      app={app}
      level={level}
      onBack={() => {
        setOpen(undefined)
      }}
      onChange={changed}
    />
  ) : (
    <AppsList sim={sim} level={level} onOpen={setOpen} />
  )
}

function AppsList({
  sim,
  level,
  onOpen,
}: {
  sim: Simulator
  level: 2 | 3
  onOpen: (name: string) => void
}) {
  const H = `h${String(level)}` as 'h2' | 'h3'
  const Sub = `h${String(level + 1)}` as 'h3' | 'h4'
  const apps = applications(sim)
  const source = (a: Application) =>
    `${a.source.repo} · ${a.source.path} · ${a.source.targetRevision}`
  return (
    <section aria-label="Applications" className="grid min-w-0 gap-3">
      <H className="text-xl font-bold">Applications</H>
      {apps.length === 0 ? (
        <p>No applications in this world yet.</p>
      ) : (
        <Tabs
          label="Application views"
          items={[
            {
              id: 'tiles',
              label: 'Tiles',
              content: (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {apps.map((a) => (
                    <li
                      key={a.name}
                      className="grid gap-2 rounded-md border-2 border-line bg-raised p-3"
                    >
                      <Sub className="font-mono font-bold">{a.name}</Sub>
                      <p className="flex flex-wrap gap-2">
                        <HealthPill health={a.status.health} /> <SyncPill sync={a.status.sync} />
                      </p>
                      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 text-sm [overflow-wrap:anywhere]">
                        <dt className="text-ink-muted">Project</dt>
                        <dd>{a.project ?? 'default'}</dd>
                        <dt className="text-ink-muted">Source</dt>
                        <dd>{source(a)}</dd>
                        <dt className="text-ink-muted">Destination</dt>
                        <dd>
                          {a.destination.cluster} / {a.destination.namespace}
                        </dd>
                        <dt className="text-ink-muted">Sync policy</dt>
                        <dd>{a.syncPolicy?.automated ? 'Automated' : 'Manual'}</dd>
                      </dl>
                      <div>
                        <Button
                          onClick={() => {
                            onOpen(a.name)
                          }}
                          aria-label={`Open ${a.name}`}
                        >
                          Open
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              id: 'list',
              label: 'List',
              content: (
                <div className="w-0 min-w-full overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="sr-only">Applications</caption>
                    <thead>
                      <tr className="border-b border-line">
                        {['Name', 'Health', 'Sync', 'Source', 'Destination', 'Sync policy'].map(
                          (h) => (
                            <th key={h} scope="col" className="p-2">
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {apps.map((a) => (
                        <tr key={a.name} className="border-b border-line">
                          <th scope="row" className="p-2 font-normal">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                onOpen(a.name)
                              }}
                            >
                              {a.name}
                            </Button>
                          </th>
                          <td className="p-2">
                            <HealthPill health={a.status.health} />
                          </td>
                          <td className="p-2">
                            <SyncPill sync={a.status.sync} />
                          </td>
                          <td className="p-2">{source(a)}</td>
                          <td className="p-2">
                            {a.destination.cluster} / {a.destination.namespace}
                          </td>
                          <td className="p-2">
                            {a.syncPolicy?.automated ? 'Automated' : 'Manual'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ),
            },
          ]}
        />
      )}
    </section>
  )
}

function AppDetails({
  sim,
  app,
  level,
  onBack,
  onChange,
}: {
  sim: Simulator
  app: Application
  level: 2 | 3
  onBack: () => void
  onChange: () => void
}) {
  const id = useId()
  const H = `h${String(level)}` as 'h2' | 'h3'
  const Sub = `h${String(level + 1)}` as 'h3' | 'h4'
  const [selected, setSelected] = useState<TreeNode>()
  const [notice, setNotice] = useState('')
  const tree = resourceTree(sim, app.name)
  const op = app.status.operationState
  const all = tree ? flatten(tree) : []
  const pick = (n: TreeNode) => {
    setSelected(n)
    requestAnimationFrame(() => document.getElementById(`${id}-node`)?.focus())
  }
  return (
    <section aria-labelledby={`${id}-title`} className="grid min-w-0 gap-4">
      <div>
        <Button variant="ghost" onClick={onBack}>
          ← All applications
        </Button>
      </div>
      <H id={`${id}-title`} className="flex flex-wrap items-center gap-3 text-xl font-bold">
        <span className="font-mono">{app.name}</span>
        {tree?.health && <HealthPill health={tree.health} />}
        <SyncPill sync={app.status.sync} />
      </H>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere]">
        <dt className="text-ink-muted">Source</dt>
        <dd>
          {app.source.repo} · {app.source.path} · {app.source.targetRevision}
          {app.status.revision && (
            <>
              {' '}
              (<code>{app.status.revision.slice(0, 7)}</code>)
            </>
          )}
        </dd>
        <dt className="text-ink-muted">Sync policy</dt>
        <dd>
          {app.syncPolicy?.automated
            ? `Automated${app.syncPolicy.automated.prune ? ', prune' : ''}${app.syncPolicy.automated.selfHeal ? ', self-heal' : ''}`
            : 'Manual'}
        </dd>
        {op && (
          <>
            <dt className="text-ink-muted">Last sync</dt>
            <dd>
              {op.phase} at {when(sim, op.finishedAt)}: {op.message}
            </dd>
          </>
        )}
        {app.status.conditions.map((c) => (
          <Field key={c} term="Condition">
            <span className="font-bold">ComparisonError:</span> {c}
          </Field>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            refresh(sim, app.name)
            setNotice(
              `Refreshed: ${app.status.sync === 'OutOfSync' ? 'out of sync' : app.status.sync.toLowerCase()} with Git.`,
            )
            onChange()
          }}
        >
          Refresh
        </Button>
        <SyncDialog
          sim={sim}
          app={app}
          onSynced={(msg) => {
            setNotice(msg)
            onChange()
          }}
        />
        <HistoryDialog
          sim={sim}
          app={app}
          onRolledBack={(msg) => {
            setNotice(msg)
            onChange()
          }}
        />
      </div>
      <p role="status" className="min-h-6">
        {notice}
      </p>
      {tree && (
        <Tabs
          label="Resource views"
          items={[
            {
              id: 'tree',
              label: 'Tree',
              content: (
                <ResourceTree
                  root={tree}
                  label={`Resources of ${app.name}`}
                  {...(selected ? { selected: selected.id } : {})}
                  onSelect={pick}
                />
              ),
            },
            {
              id: 'table',
              label: 'Table',
              content: (
                <div className="w-0 min-w-full overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <caption className="sr-only">Resources of {app.name}</caption>
                    <thead>
                      <tr className="border-b border-line">
                        {['Kind', 'Name', 'Part of', 'Health', 'Sync'].map((h) => (
                          <th key={h} scope="col" className="p-2">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {all.map(({ node, parent }) => (
                        <tr key={node.id} className="border-b border-line">
                          <td className="p-2">{node.kind}</td>
                          <th scope="row" className="p-2 font-normal">
                            <Button
                              variant="ghost"
                              aria-label={`${node.kind} ${node.name}: details`}
                              onClick={() => {
                                pick(node)
                              }}
                            >
                              <span className="font-mono">{node.name}</span>
                            </Button>
                          </th>
                          <td className="p-2 font-mono">
                            {parent
                              ? `${KIND_SHORT[parent.kind] ?? parent.kind}/${parent.name}`
                              : '—'}
                          </td>
                          <td className="p-2">
                            {node.health ? <HealthPill health={node.health} /> : '—'}
                          </td>
                          <td className="p-2">{node.sync ? <SyncPill sync={node.sync} /> : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ),
            },
          ]}
        />
      )}
      {selected && (
        <NodePanel id={`${id}-node`} sim={sim} app={app} node={selected} heading={Sub} />
      )}
    </section>
  )
}

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{term}</dt>
      <dd>{children}</dd>
    </>
  )
}

function flatten(n: TreeNode, parent?: TreeNode): { node: TreeNode; parent?: TreeNode }[] {
  return [{ node: n, ...(parent ? { parent } : {}) }, ...n.children.flatMap((c) => flatten(c, n))]
}

/** A node's details: summary, live and desired manifests, the diff, events and (pods) logs. */
function NodePanel({
  id,
  sim,
  app,
  node,
  heading: Heading,
}: {
  id: string
  sim: Simulator
  app: Application
  node: TreeNode
  heading: 'h3' | 'h4'
}) {
  const d = nodeDetails(sim, app.name, node)
  if (!d) return null
  const items = [
    {
      id: 'summary',
      label: 'Summary',
      content: (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere]">
          <dt className="text-ink-muted">Kind</dt>
          <dd>{node.kind}</dd>
          <dt className="text-ink-muted">Namespace</dt>
          <dd>{node.namespace}</dd>
          {node.health && (
            <>
              <dt className="text-ink-muted">Health</dt>
              <dd>
                <HealthPill health={node.health} /> {node.healthMessage}
              </dd>
            </>
          )}
          {node.sync && (
            <>
              <dt className="text-ink-muted">Sync</dt>
              <dd>
                <SyncPill sync={node.sync} />
              </dd>
            </>
          )}
        </dl>
      ),
    },
    {
      id: 'live',
      label: 'Live manifest',
      content: d.live ? <pre className={pre}>{d.live}</pre> : <p>Not in the cluster.</p>,
    },
    ...(d.desired !== undefined
      ? [
          {
            id: 'desired',
            label: 'Desired manifest',
            content: <pre className={pre}>{d.desired}</pre>,
          },
          {
            id: 'diff',
            label: 'Diff',
            content: d.diff ? (
              <pre className={pre}>{d.diff}</pre>
            ) : (
              <p>No differences: the cluster matches Git.</p>
            ),
          },
        ]
      : []),
    {
      id: 'events',
      label: 'Events',
      content: d.events.length ? (
        <div className="w-0 min-w-full overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Events for {node.name}</caption>
            <thead>
              <tr className="border-b border-line">
                {['Type', 'Reason', 'Last seen', 'Count', 'Message'].map((h) => (
                  <th key={h} scope="col" className="p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.events.map((e, i) => (
                <tr key={i} className="border-b border-line">
                  <td className="p-2">{e.type}</td>
                  <td className="p-2">{e.reason}</td>
                  <td className="p-2 whitespace-nowrap">{when(sim, e.at)}</td>
                  <td className="p-2">{e.count}</td>
                  <td className="p-2">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No events.</p>
      ),
    },
    ...(d.logs
      ? [
          {
            id: 'logs',
            label: 'Logs',
            content: d.logs.ok ? (
              // The log scrolls sideways, so it must be keyboard-reachable.
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
              <pre className={pre} role="region" aria-label={`Logs of ${node.name}`} tabIndex={0}>
                {d.logs.lines.join('\n')}
              </pre>
            ) : (
              <p>{d.logs.error}</p>
            ),
          },
        ]
      : []),
  ]
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-label={`${node.kind} ${node.name}`}
      className="grid min-w-0 gap-2 rounded-md border border-line p-3"
    >
      <Heading className="font-bold">
        <span className="font-mono">
          {KIND_SHORT[node.kind] ?? node.kind}/{node.name}
        </span>
      </Heading>
      <Tabs key={node.id} label={`Details of ${node.name}`} items={items} />
    </section>
  )
}

function SyncDialog({
  sim,
  app,
  onSynced,
}: {
  sim: Simulator
  app: Application
  onSynced: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [prune, setPrune] = useState(false)
  const [dryRun, setDryRun] = useState(false)
  const [preview, setPreview] = useState<{ error?: string; rows: SyncPreviewRow[] }>()
  return (
    <Dialog
      title={`Sync ${app.name}`}
      description="Apply what Git describes to the cluster."
      trigger={<Button variant="primary">Sync…</Button>}
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setPreview(undefined)
      }}
      closeLabel="Cancel"
    >
      <div className="grid gap-3">
        <Checkbox
          label="Prune: delete what Git no longer describes"
          checked={prune}
          onCheckedChange={(v) => {
            setPrune(v)
          }}
        />
        <Checkbox
          label="Dry run: show what would change, change nothing"
          checked={dryRun}
          onCheckedChange={(v) => {
            setDryRun(v)
          }}
        />
        <div>
          <Button
            variant="primary"
            onClick={() => {
              if (dryRun) {
                setPreview(syncPreview(sim, app.name, { prune }))
                return
              }
              const a = sync(sim, app.name, prune ? { prune } : {})
              const op = a?.status.operationState
              setOpen(false)
              onSynced(op ? `Sync ${op.phase.toLowerCase()}: ${op.message}` : 'Sync started.')
            }}
          >
            Synchronize
          </Button>
        </div>
        {preview && (
          <div role="status" className="grid gap-2">
            {preview.error ? (
              <p>The dry run failed: {preview.error}</p>
            ) : (
              <>
                <p className="font-bold">Dry run: nothing was changed.</p>
                <ul className="list-disc pl-6">
                  {preview.rows.map((r) => (
                    <li key={`${r.kind}/${r.name}`}>
                      {r.kind} {r.name}: {r.action}
                      {r.message ? ` (${r.message})` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

function HistoryDialog({
  sim,
  app,
  onRolledBack,
}: {
  sim: Simulator
  app: Application
  onRolledBack: (msg: string) => void
}) {
  const [open, setOpen] = useState(false)
  const r = repo(sim, app.source.repo)
  const auto = app.syncPolicy?.automated !== undefined
  const current = app.status.history.at(-1)?.id
  return (
    <Dialog
      title={`History and rollback: ${app.name}`}
      trigger={<Button>History and rollback</Button>}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="grid gap-3">
        {auto && (
          <p>
            Auto-sync is on, so rollback is turned off: Argo CD would sync back to Git within
            minutes. Revert the commit in Git instead, or turn auto-sync off first.
          </p>
        )}
        {app.status.history.length === 0 ? (
          <p>Nothing has been synced yet.</p>
        ) : (
          <div className="w-0 min-w-full overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Sync history</caption>
              <thead>
                <tr className="border-b border-line">
                  {['ID', 'Deployed', 'Revision', 'Commit message', 'Rollback'].map((h) => (
                    <th key={h} scope="col" className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...app.status.history].reverse().map((h) => (
                  <tr key={h.id} className="border-b border-line">
                    <th scope="row" className="p-2">
                      {h.id}
                    </th>
                    <td className="p-2 whitespace-nowrap">{when(sim, h.deployedAt)}</td>
                    <td className="p-2 font-mono">{h.revision.slice(0, 7)}</td>
                    <td className="p-2">{r?.commits[h.revision]?.message.split('\n')[0] ?? ''}</td>
                    <td className="p-2">
                      {h.id === current ? (
                        'Current'
                      ) : (
                        <Button
                          disabled={auto}
                          aria-label={`Roll back to ${String(h.id)} (${h.revision.slice(0, 7)})`}
                          onClick={() => {
                            const a = sync(sim, app.name, { revision: h.revision })
                            setOpen(false)
                            onRolledBack(
                              `Rolled back to ${h.revision.slice(0, 7)}: ${a?.status.operationState?.message ?? ''}`,
                            )
                          }}
                        >
                          Roll back
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Dialog>
  )
}
