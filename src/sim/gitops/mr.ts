import type { Simulator } from '../core/simulator.ts'
import {
  commit,
  createBranch,
  merge,
  mergeRequests,
  openMergeRequest,
  repo,
  resolve,
  type Commit,
  type MergeRequest,
  revert,
  type Repo,
} from './git.ts'
import { ciProject, pipelines, startPipeline, type Pipeline } from './pipeline.ts'

/**
 * The merge request flow (E7-03): change a file on a new branch, open a merge request, let its pipeline
 * check it, push fixes, and merge once the pipeline passes ("Pipelines must succeed"). Argo CD picks the
 * merge up on its next reconcile.
 */
export const LEARNER = 'you'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/\.[a-z]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** Every commit reachable from `sha`, `sha` included. */
export function ancestors(r: Repo, sha: string): Set<string> {
  const seen = new Set<string>()
  const todo = [sha]
  for (let s = todo.pop(); s !== undefined; s = todo.pop()) {
    if (seen.has(s)) continue
    seen.add(s)
    todo.push(...(r.commits[s]?.parents ?? []))
  }
  return seen
}

/** Where `branch` left `target`: the newest commit on the branch's first-parent line that `target` has. */
function mergeBase(r: Repo, branch: string, target: string): string | undefined {
  const onTarget = ancestors(r, r.branches[target] ?? '')
  for (let c = resolve(r, branch); c; c = c.parents[0] ? r.commits[c.parents[0]] : undefined)
    if (onTarget.has(c.sha)) return c.sha
  return undefined
}

function runPipeline(sim: Simulator, mr: MergeRequest): Pipeline | undefined {
  const r = repo(sim, mr.repo)
  if (!r || !ciProject(sim, mr.repo)) return undefined
  const base = mergeBase(r, mr.source, mr.target)
  return startPipeline(sim, mr.repo, { ref: mr.source, mr: mr.id, ...(base ? { base } : {}) })
}

/** Commits `changes` to a new branch and opens a merge request for it; its pipeline starts if the repo has CI. */
export function proposeChange(
  sim: Simulator,
  c: {
    repo: string
    changes: Record<string, string | null>
    message: string
    title?: string
    branch?: string
  },
): { mr: MergeRequest; pipeline?: Pipeline } {
  const r = repo(sim, c.repo)
  if (!r) throw new Error(`no repository ${c.repo}`)
  const first = Object.keys(c.changes)[0] ?? 'change'
  let branch = c.branch ?? `${LEARNER}/${slugify(first.split('/').at(-1) ?? first)}`
  for (let n = 2; Object.hasOwn(r.branches, branch); n++)
    branch = `${c.branch ?? `${LEARNER}/${slugify(first.split('/').at(-1) ?? first)}`}-${String(n)}`
  createBranch(sim, c.repo, branch, r.defaultBranch)
  commit(sim, c.repo, branch, c.changes, c.message, LEARNER)
  const mr = openMergeRequest(
    sim,
    c.repo,
    branch,
    r.defaultBranch,
    c.title ?? c.message.split('\n')[0] ?? branch,
    LEARNER,
  )
  const pipeline = runPipeline(sim, mr)
  return { mr, ...(pipeline ? { pipeline } : {}) }
}

/** Reverts a commit (default: the default branch's newest) on a new branch, through a merge request. */
export function proposeRevert(
  sim: Simulator,
  repoName: string,
  sha?: string,
): { mr: MergeRequest; pipeline?: Pipeline } {
  const r = repo(sim, repoName)
  const target = r && (sha ? r.commits[sha] : resolve(r, r.defaultBranch))
  if (!r || !target) throw new Error(`nothing to revert in ${repoName}`)
  let branch = `${LEARNER}/revert-${target.sha.slice(0, 8)}`
  for (let n = 2; Object.hasOwn(r.branches, branch); n++)
    branch = `${LEARNER}/revert-${target.sha.slice(0, 8)}-${String(n)}`
  createBranch(sim, repoName, branch, r.defaultBranch)
  const c = revert(sim, repoName, branch, target.sha)
  const mr = openMergeRequest(
    sim,
    repoName,
    branch,
    r.defaultBranch,
    c.message.split('\n')[0] ?? branch,
    LEARNER,
  )
  const pipeline = runPipeline(sim, mr)
  return { mr, ...(pipeline ? { pipeline } : {}) }
}

export const mergeRequest = (sim: Simulator, id: number) =>
  mergeRequests(sim).find((m) => m.id === id)

/** Another commit on the merge request's branch (a fix after a failed pipeline); a new pipeline runs. */
export function pushToMergeRequest(
  sim: Simulator,
  id: number,
  changes: Record<string, string | null>,
  message: string,
): { commit: Commit; pipeline?: Pipeline } {
  const mr = mergeRequest(sim, id)
  if (mr?.state !== 'opened') throw new Error(`merge request !${String(id)} is not open`)
  const c = commit(sim, mr.repo, mr.source, changes, message, LEARNER)
  const pipeline = runPipeline(sim, mr)
  return { commit: c, ...(pipeline ? { pipeline } : {}) }
}

export const mrPipelines = (sim: Simulator, id: number): Pipeline[] =>
  pipelines(sim).filter((p) => p.mr === id)

/** Why the merge request can't merge yet, or undefined if it can. */
export function mergeBlocker(sim: Simulator, id: number): string | undefined {
  const mr = mergeRequest(sim, id)
  if (!mr) return `There is no merge request !${String(id)}.`
  if (mr.state !== 'opened') return `This merge request is already ${mr.state}.`
  if (!ciProject(sim, mr.repo)) return undefined
  const last = mrPipelines(sim, id).at(-1)
  if (!last) return 'Waiting for a pipeline to start.'
  if (last.status === 'running')
    return `Pipeline #${String(last.id)} is still running. Merging waits for it to pass.`
  if (last.status === 'failed')
    return `Pipeline #${String(last.id)} failed. Fix what it reports, push the fix to this branch, and a new pipeline will run.`
  return undefined
}

export function mergeMergeRequest(sim: Simulator, id: number): Commit {
  const blocked = mergeBlocker(sim, id)
  if (blocked) throw new Error(blocked)
  return merge(sim, id, LEARNER)
}

/** The file as it is on the merge request's branch (or the default branch). */
export function fileAt(
  sim: Simulator,
  repoName: string,
  path: string,
  ref?: string,
): string | undefined {
  const r = repo(sim, repoName)
  return r && resolve(r, ref ?? r.defaultBranch)?.files[path]
}
