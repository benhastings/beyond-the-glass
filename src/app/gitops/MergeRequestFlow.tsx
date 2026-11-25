import { useId, useState, type ReactNode } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import { application, refresh } from '@/sim/gitops/argo'
import { repo, resolve } from '@/sim/gitops/git'
import {
  fileAt,
  mergeBlocker,
  mergeMergeRequest,
  mergeRequest,
  mrPipelines,
  proposeChange,
  pushToMergeRequest,
} from '@/sim/gitops/mr'
import { resourceTree } from '@/sim/gitops/tree'
import { Button } from '../ui/Button'
import { StatusPill } from '../ui/StatusPill'
import { cx, focusRing } from '../ui/styles'
import { HealthPill, SyncPill } from './argo/status'
import { DiffView } from './DiffView'
import { PipelineView } from './PipelineView'

const input = cx('min-h-11 w-full rounded-md border border-line bg-surface px-3', focusRing)

/** Advances the simulation in steps until `done` holds or `limitMs` passes (pipelines, Argo's loop). */
function waitUntil(sim: Simulator, done: () => boolean, stepMs: number, limitMs: number) {
  for (let waited = 0; !done() && waited < limitMs; waited += stepMs) sim.advance(stepMs)
}

/**
 * The merge request flow (E7-03): edit a manifest with its diff beside it, commit to a branch and open a
 * merge request, watch its pipeline, push fixes until it passes, merge, and watch Argo CD sync it. Every
 * step works from the keyboard. `onChange` runs after anything that changes the simulation.
 */
export function MergeRequestFlow({
  sim,
  repo: repoName,
  files,
  app,
  task,
  level = 2,
  onChange,
}: {
  sim: Simulator
  repo: string
  /** The files the learner may edit (default: every manifest in the repo). */
  files?: string[]
  /** The Argo CD application that deploys the repo, to watch after merging. */
  app?: string
  task?: ReactNode
  level?: 2 | 3
  onChange?: () => void
}) {
  const id = useId()
  const H = `h${String(level)}` as 'h2' | 'h3'
  const Sub = `h${String(level + 1)}` as 'h3' | 'h4'
  const r = repo(sim, repoName)
  const editable =
    files ??
    Object.keys((r && resolve(r, r.defaultBranch)?.files) ?? {}).filter((f) =>
      /\.(ya?ml|json)$/.test(f),
    )
  const [mrId, setMrId] = useState<number>()
  const mr = mrId === undefined ? undefined : mergeRequest(sim, mrId)
  const [editing, setEditing] = useState(true)
  const [file, setFile] = useState(editable[0] ?? '')
  const ref = mr?.source
  const original = fileAt(sim, repoName, file, ref) ?? ''
  const [text, setText] = useState(original)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [, setVersion] = useState(0)
  const changed = () => {
    setVersion((v) => v + 1)
    onChange?.()
  }
  const focus = (target: string) => {
    requestAnimationFrame(() => document.getElementById(target)?.focus())
  }

  const submit = () => {
    if (text === original) {
      setError('Change the file first: there’s nothing to commit yet.')
      return
    }
    if (!message.trim()) {
      setError('Write a commit message: one line that says what this change does.')
      return
    }
    setError('')
    if (mr) {
      const pushed = pushToMergeRequest(sim, mr.id, { [file]: text }, message.trim())
      setNotice(
        `Pushed ${pushed.commit.sha.slice(0, 8)} to ${mr.source}. ${pushed.pipeline ? `Pipeline #${String(pushed.pipeline.id)} started.` : ''}`,
      )
    } else {
      const opened = proposeChange(sim, {
        repo: repoName,
        changes: { [file]: text },
        message: message.trim(),
      })
      setMrId(opened.mr.id)
      setNotice(
        `Opened merge request !${String(opened.mr.id)} from ${opened.mr.source}. ${opened.pipeline ? `Pipeline #${String(opened.pipeline.id)} started.` : ''}`,
      )
    }
    setMessage('')
    setEditing(false)
    changed()
    focus(`${id}-mr`)
  }

  if (editing)
    return (
      <section aria-labelledby={`${id}-edit`} className="grid min-w-0 gap-4">
        <H id={`${id}-edit`} tabIndex={-1} className={cx('text-xl font-bold', focusRing)}>
          {mr ? `Push a fix to !${String(mr.id)}` : 'Change a manifest'}
        </H>
        {task && <div className="max-w-prose">{task}</div>}
        <p className="text-sm">
          Repository <code>{repoName}</code>,{' '}
          {mr ? (
            <>
              branch <code>{mr.source}</code>
            </>
          ) : (
            <>
              a new branch from <code>{r?.defaultBranch ?? 'main'}</code>
            </>
          )}
          .
        </p>
        {editable.length > 1 && (
          <label className="grid max-w-sm gap-1">
            File
            <select
              className={input}
              value={file}
              onChange={(e) => {
                setFile(e.target.value)
                setText(fileAt(sim, repoName, e.target.value, ref) ?? '')
              }}
            >
              {editable.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1">
          <span>
            Edit <code>{file}</code>{' '}
            <span className="text-sm text-ink-muted">
              (spaces for indentation; Tab leaves the editor)
            </span>
          </span>
          <textarea
            id={`${id}-text`}
            className={cx(
              'min-h-64 w-full rounded-md border border-line bg-term-ground p-3 font-mono text-sm text-term-ink',
              focusRing,
            )}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={Math.min(30, text.split('\n').length + 2)}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
            }}
          />
        </label>
        <Sub className="font-bold">Your change</Sub>
        <DiffView before={original} after={text} label={`Changes to ${file}`} />
        <label className="grid max-w-prose gap-1">
          Commit message
          <input
            className={input}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </label>
        {error && (
          <p id={`${id}-error`} role="alert" className="font-bold">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={submit}>
            {mr ? 'Commit and push' : 'Commit and open merge request'}
          </Button>
          {mr && (
            <Button
              onClick={() => {
                setEditing(false)
                focus(`${id}-mr`)
              }}
            >
              Back to the merge request
            </Button>
          )}
        </div>
      </section>
    )

  if (!mr || !r) return null
  const pipelines = mrPipelines(sim, mr.id)
  const last = pipelines.at(-1)
  const blocker = mergeBlocker(sim, mr.id)
  const target = r.commits[r.branches[mr.target] ?? '']
  const head = resolve(r, mr.source)
  const base = last?.base ? r.commits[last.base] : target
  const merged = mr.state === 'merged' ? mr.mergedSha : undefined
  const argo = app ? application(sim, app) : undefined
  const tree = app ? resourceTree(sim, app) : undefined
  const deployed =
    merged !== undefined && argo?.status.revision === merged && argo.status.sync === 'Synced'
  return (
    <section aria-labelledby={`${id}-mr`} className="grid min-w-0 gap-4">
      <H
        id={`${id}-mr`}
        tabIndex={-1}
        className={cx('flex flex-wrap items-center gap-3 text-xl font-bold', focusRing)}
      >
        Merge request !{mr.id}: {mr.title}
        <StatusPill status={mr.state === 'merged' ? 'ok' : 'info'}>
          {mr.state === 'merged' ? 'Merged' : 'Open'}
        </StatusPill>
      </H>
      <p className="text-sm">
        <code>{mr.source}</code> into <code>{mr.target}</code>, in <code>{mr.repo}</code>
      </p>
      <p role="status" className="min-h-6">
        {notice}
      </p>
      <Sub className="font-bold">Changes</Sub>
      {Object.keys(head?.files ?? {})
        .filter((f) => (base?.files[f] ?? '') !== (head?.files[f] ?? ''))
        .map((f) => (
          <div key={f} className="grid gap-1">
            <p className="font-mono text-sm">{f}</p>
            <DiffView
              before={base?.files[f] ?? ''}
              after={head?.files[f] ?? ''}
              label={`Changes to ${f}`}
            />
          </div>
        ))}
      {last && (
        <>
          <PipelineView pipeline={last} now={sim.now} level={level === 2 ? 3 : 4} />
          {last.status === 'running' && (
            <div>
              <Button
                onClick={() => {
                  waitUntil(sim, () => last.status !== 'running', 10_000, 30 * 60_000)
                  setNotice(
                    `Pipeline #${String(last.id)} ${last.status === 'success' ? 'passed' : 'failed'}.`,
                  )
                  changed()
                }}
              >
                Wait for the pipeline
              </Button>
            </div>
          )}
        </>
      )}
      {!merged && (
        <div className="grid gap-2">
          <p id={`${id}-blocker`}>{blocker ?? 'Ready to merge: the pipeline passed.'}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              aria-describedby={`${id}-blocker`}
              onClick={() => {
                if (blocker) {
                  setNotice(`Not merged yet. ${blocker}`)
                  return
                }
                const c = mergeMergeRequest(sim, mr.id)
                setNotice(
                  `Merged into ${mr.target} as ${c.sha.slice(0, 8)}.${app ? ' Argo CD will notice it on its next refresh.' : ''}`,
                )
                changed()
              }}
            >
              Merge
            </Button>
            {last?.status !== 'running' && (
              <Button
                onClick={() => {
                  setFile(editable.includes(file) ? file : (editable[0] ?? ''))
                  setText(fileAt(sim, repoName, file, mr.source) ?? '')
                  setEditing(true)
                  focus(`${id}-text`)
                }}
              >
                Edit and push a fix
              </Button>
            )}
          </div>
        </div>
      )}
      {merged && app && (
        <div className="grid gap-2">
          <Sub className="font-bold">Argo CD</Sub>
          {argo && (
            <p className="flex flex-wrap items-center gap-2">
              <code>{app}</code> {tree?.health && <HealthPill health={tree.health} />}{' '}
              <SyncPill sync={argo.status.sync} />
              {argo.status.revision && (
                <>
                  at <code>{argo.status.revision.slice(0, 8)}</code>
                </>
              )}
            </p>
          )}
          {deployed ? (
            <p>Argo CD has synced your merge: the cluster now runs what Git says.</p>
          ) : (
            <div>
              <Button
                onClick={() => {
                  waitUntil(
                    sim,
                    () => {
                      const a = refresh(sim, app)
                      return a?.status.revision === merged && a.status.sync === 'Synced'
                    },
                    15_000,
                    10 * 60_000,
                  )
                  const a = application(sim, app)
                  setNotice(
                    a?.status.revision === merged && a.status.sync === 'Synced'
                      ? `Argo CD synced ${merged.slice(0, 8)}.`
                      : `Argo CD hasn’t synced ${merged.slice(0, 8)} yet: it’s ${a?.status.sync ?? 'Unknown'}. Its application may not sync automatically.`,
                  )
                  changed()
                }}
              >
                Watch Argo CD
              </Button>
            </div>
          )}
        </div>
      )}
      {merged && (
        <div>
          <Button
            onClick={() => {
              setMrId(undefined)
              setFile(editable[0] ?? '')
              setText(fileAt(sim, repoName, editable[0] ?? '') ?? '')
              setNotice('')
              setEditing(true)
              focus(`${id}-edit`)
            }}
          >
            Start another change
          </Button>
        </div>
      )}
    </section>
  )
}
