import { useId, useState } from 'react'
import { STAGES, type Job, type JobStatus, type Pipeline } from '@/sim/gitops/pipeline'
import { Button } from '../ui/Button'
import { StatusPill, type Status } from '../ui/StatusPill'
import { Tabs } from '../ui/Tabs'
import { cx, focusRing } from '../ui/styles'

const STATUS: Record<JobStatus | Pipeline['status'], { pill: Status; label: string }> = {
  success: { pill: 'ok', label: 'Passed' },
  failed: { pill: 'alert', label: 'Failed' },
  running: { pill: 'info', label: 'Running' },
  created: { pill: 'neutral', label: 'Created' },
  skipped: { pill: 'neutral', label: 'Skipped' },
}

/** "1m 05s", as GitLab shows durations. */
export function duration(ms: number): string {
  const s = Math.round(ms / 1000)
  return s < 60
    ? `${String(s)}s`
    : `${String(Math.floor(s / 60))}m ${String(s % 60).padStart(2, '0')}s`
}

/** How long a job has taken so far (running) or took (finished); nothing before it starts. */
function elapsed(j: Job, now: number): string {
  if (j.startedAt === undefined) return ''
  return duration((j.finishedAt ?? now) - j.startedAt)
}

export function JobStatusPill({ status }: { status: JobStatus | Pipeline['status'] }) {
  return <StatusPill status={STATUS[status].pill}>{STATUS[status].label}</StatusPill>
}

const stageTitle = (s: string) => s.replace('-', ' ')

/**
 * A GitLab-style pipeline (E7-02): the stages as a graph of jobs, or as a table with the same information,
 * the commit, merge request and image it is linked to, and each job's log in collapsible sections.
 * Status is always an icon **and** a word.
 */
export function PipelineView({
  pipeline: p,
  now,
  level = 2,
}: {
  pipeline: Pipeline
  now: number
  /** The title's heading level; stages and the log are one level below. */
  level?: 2 | 3
}) {
  const H = `h${String(level)}` as 'h2' | 'h3'
  const Sub = `h${String(level + 1)}` as 'h3' | 'h4'
  const [open, setOpen] = useState<number>()
  const id = useId()
  const job = p.jobs.find((j) => j.id === open)
  const openJob = (j: Job) => {
    setOpen(j.id)
    requestAnimationFrame(() => document.getElementById(`${id}-log`)?.focus())
  }
  return (
    <section aria-labelledby={`${id}-title`} className="grid min-w-0 gap-4">
      <header className="grid gap-2">
        <H id={`${id}-title`} className="flex flex-wrap items-center gap-3 text-xl font-bold">
          Pipeline #{p.id} <JobStatusPill status={p.status} />
        </H>
        <p>{p.title}</p>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm [overflow-wrap:anywhere]">
          <dt className="text-ink-muted">Project</dt>
          <dd>ravenpost/{p.project}</dd>
          <dt className="text-ink-muted">Commit</dt>
          <dd>
            <code title={p.sha}>{p.sha.slice(0, 8)}</code> on <code>{p.ref}</code>
          </dd>
          {p.mr !== undefined && (
            <>
              <dt className="text-ink-muted">Merge request</dt>
              <dd>!{p.mr}</dd>
            </>
          )}
          <dt className="text-ink-muted">Image pushed</dt>
          <dd>{p.image ? <code>{p.image}</code> : 'None yet'}</dd>
          {p.deployedImage && (
            <>
              <dt className="text-ink-muted">Deploy repo now runs</dt>
              <dd>
                <code>{p.deployedImage}</code>
                {p.deployCommit && (
                  <>
                    {' '}
                    (commit <code title={p.deployCommit}>{p.deployCommit.slice(0, 8)}</code>)
                  </>
                )}
              </dd>
            </>
          )}
        </dl>
      </header>
      <Tabs
        label={`Pipeline #${String(p.id)} views`}
        items={[
          {
            id: 'graph',
            label: 'Graph',
            content: (
              <ol aria-label="Stages" className="flex w-0 min-w-full gap-4 overflow-x-auto pb-2">
                {STAGES.map((s) => (
                  <li key={s} className="grid min-w-44 content-start gap-2">
                    <Sub className="font-bold capitalize">{stageTitle(s)}</Sub>
                    <ul className="grid gap-2">
                      {p.jobs
                        .filter((j) => j.stage === s)
                        .map((j) => (
                          <li key={j.id}>
                            <button
                              type="button"
                              onClick={() => {
                                openJob(j)
                              }}
                              aria-pressed={open === j.id}
                              className={cx(
                                'grid w-full gap-1 rounded-md border-2 border-line bg-raised p-2 text-left aria-pressed:border-accent',
                                focusRing,
                              )}
                            >
                              <span className="font-mono">{j.name}</span>
                              <span className="flex flex-wrap items-center gap-2 text-sm">
                                <JobStatusPill status={j.status} />
                                {elapsed(j, now)}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ul>
                  </li>
                ))}
              </ol>
            ),
          },
          {
            id: 'list',
            label: 'List',
            content: (
              <div className="w-0 min-w-full overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <caption className="sr-only">Jobs in pipeline #{p.id}</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="p-2">
                        Stage
                      </th>
                      <th scope="col" className="p-2">
                        Job
                      </th>
                      <th scope="col" className="p-2">
                        Status
                      </th>
                      <th scope="col" className="p-2">
                        Duration
                      </th>
                      <th scope="col" className="p-2">
                        <span className="sr-only">Log</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.jobs.map((j) => (
                      <tr key={j.id} className="border-b border-line">
                        <td className="p-2 capitalize">{stageTitle(j.stage)}</td>
                        <th scope="row" className="p-2 font-mono font-normal">
                          {j.name}
                        </th>
                        <td className="p-2">
                          <JobStatusPill status={j.status} />
                        </td>
                        <td className="p-2">{elapsed(j, now)}</td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            aria-label={`View log for ${j.name}`}
                            onClick={() => {
                              openJob(j)
                            }}
                          >
                            View log
                          </Button>
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
      {job && <JobLog id={`${id}-log`} job={job} now={now} heading={Sub} />}
    </section>
  )
}

/** A job's log: each runner section collapsible, with its duration; the result line always shown. */
export function JobLog({
  id,
  job,
  now,
  heading: Heading = 'h3',
}: {
  id: string
  job: Job
  now: number
  heading?: 'h3' | 'h4'
}) {
  return (
    <section
      id={id}
      tabIndex={-1}
      aria-label={`Log for ${job.name}`}
      className={cx('grid gap-2 rounded-md border border-line p-3', focusRing)}
    >
      <Heading className="flex flex-wrap items-center gap-3 font-bold">
        <span className="font-mono">{job.name}</span> <JobStatusPill status={job.status} />{' '}
        {elapsed(job, now)}
      </Heading>
      <div className="grid gap-1 rounded-md bg-term-ground p-2 font-mono text-sm text-term-ink">
        {job.sections.map((s) =>
          s.title ? (
            <details key={s.id} open={s.id === 'step_script'}>
              <summary className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-term-focus focus-visible:outline-solid">
                {s.title} <span className="text-term-ink-muted">({duration(s.durationMs)})</span>
              </summary>
              {s.lines.length > 0 && (
                <pre className="pl-4 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {s.lines.join('\n')}
                </pre>
              )}
            </details>
          ) : (
            <pre key={s.id} className="whitespace-pre-wrap font-bold">
              {s.lines.join('\n')}
            </pre>
          ),
        )}
        {job.status === 'created' && (
          <p>This job hasn’t started: it waits for the stages before it.</p>
        )}
        {job.status === 'skipped' && (
          <p>Skipped: an earlier stage failed, so this job didn’t run.</p>
        )}
      </div>
    </section>
  )
}
