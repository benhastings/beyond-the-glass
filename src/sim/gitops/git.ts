import { fnv1a32 } from '../core/rng.ts'
import type { Simulator } from '../core/simulator.ts'

/**
 * Virtual Git (E7-01): repositories of plain-text files, commits with deterministic SHAs, branches,
 * merge requests and reverts. Everything lives in the simulation's state, so it's snapshotted with the
 * cluster and replays identically.
 */
export interface Commit {
  sha: string
  parents: string[]
  message: string
  author: string
  /** Sim time (ms). */
  at: number
  /** The whole tree at this commit: path → content. */
  files: Record<string, string>
}

export interface MergeRequest {
  id: number
  repo: string
  title: string
  source: string
  target: string
  author: string
  state: 'opened' | 'merged' | 'closed'
  createdAt: number
  mergedSha?: string
}

export interface Repo {
  name: string
  defaultBranch: string
  branches: Record<string, string>
  commits: Record<string, Commit>
}

interface GitState extends Record<string, unknown> {
  repos: Record<string, Repo>
  mrs: MergeRequest[]
}

const state = (sim: Simulator) => sim.state<GitState>('git', () => ({ repos: {}, mrs: [] }))

/** A 40-character hex SHA derived from the commit's contents, so it's the same on every run. */
function sha(parts: string[]): string {
  const seed = parts.join('\u0000')
  return [0, 1, 2, 3, 4]
    .map((i) =>
      fnv1a32(`${String(i)}:${seed}`)
        .toString(16)
        .padStart(8, '0'),
    )
    .join('')
}

export const shortSha = (s: string) => s.slice(0, 8)

export function repo(sim: Simulator, name: string): Repo | undefined {
  return state(sim).repos[name]
}

export function repos(sim: Simulator): Repo[] {
  return Object.values(state(sim).repos)
}

/** Creates a repository with an initial commit on its default branch. */
export function createRepo(
  sim: Simulator,
  name: string,
  files: Record<string, string>,
  opts: { branch?: string; author?: string; message?: string } = {},
): Repo {
  const branch = opts.branch ?? 'main'
  const c: Commit = {
    sha: sha([name, 'initial', JSON.stringify(files)]),
    parents: [],
    message: opts.message ?? 'Initial commit',
    author: opts.author ?? 'platform-team',
    at: sim.now,
    files: { ...files },
  }
  const r: Repo = {
    name,
    defaultBranch: branch,
    branches: { [branch]: c.sha },
    commits: { [c.sha]: c },
  }
  state(sim).repos[name] = r
  return r
}

/** Resolves a branch name or a (possibly short) SHA. */
export function resolve(r: Repo, ref: string): Commit | undefined {
  const head = r.branches[ref]
  if (head) return r.commits[head]
  if (ref === 'HEAD') return r.commits[r.branches[r.defaultBranch] ?? '']
  const matches = Object.keys(r.commits).filter((s) => s.startsWith(ref))
  return matches.length === 1 ? r.commits[matches[0] ?? ''] : undefined
}

/** Commits changes (path → new content, or null to delete) on top of a branch, moving it. */
export function commit(
  sim: Simulator,
  repoName: string,
  branch: string,
  changes: Record<string, string | null>,
  message: string,
  author = 'you',
): Commit {
  const r = repo(sim, repoName)
  if (!r) throw new Error(`no repository "${repoName}"`)
  const parent = r.commits[r.branches[branch] ?? '']
  if (!parent) throw new Error(`no branch "${branch}" in ${repoName}`)
  const files = { ...parent.files }
  for (const [p, content] of Object.entries(changes)) {
    if (content === null) Reflect.deleteProperty(files, p)
    else files[p] = content
  }
  const c: Commit = {
    sha: sha([repoName, parent.sha, message, JSON.stringify(files), String(sim.now)]),
    parents: [parent.sha],
    message,
    author,
    at: sim.now,
    files,
  }
  r.commits[c.sha] = c
  r.branches[branch] = c.sha
  return c
}

export function createBranch(sim: Simulator, repoName: string, name: string, from: string): void {
  const r = repo(sim, repoName)
  const c = r && resolve(r, from)
  if (!r || !c) throw new Error(`can't branch from "${from}" in ${repoName}`)
  r.branches[name] = c.sha
}

/** The commits reachable from a ref, newest first (first parents only, like `git log --first-parent`). */
export function log(sim: Simulator, repoName: string, ref: string): Commit[] {
  const r = repo(sim, repoName)
  const out: Commit[] = []
  let c = r && resolve(r, ref)
  while (r && c) {
    out.push(c)
    c = r.commits[c.parents[0] ?? '']
  }
  return out
}

/** `git revert`: a new commit that puts back the files the reverted commit changed. */
export function revert(
  sim: Simulator,
  repoName: string,
  branch: string,
  target: string,
  author = 'you',
): Commit {
  const r = repo(sim, repoName)
  const c = r && resolve(r, target)
  if (!r || !c) throw new Error(`no commit "${target}" in ${repoName}`)
  const parent = r.commits[c.parents[0] ?? '']
  if (!parent) throw new Error('cannot revert the initial commit')
  const changes: Record<string, string | null> = {}
  for (const p of new Set([...Object.keys(c.files), ...Object.keys(parent.files)]))
    if (c.files[p] !== parent.files[p]) changes[p] = parent.files[p] ?? null
  return commit(
    sim,
    repoName,
    branch,
    changes,
    `Revert "${c.message}"\n\nThis reverts commit ${c.sha}.`,
    author,
  )
}

export function openMergeRequest(
  sim: Simulator,
  repoName: string,
  source: string,
  target: string,
  title: string,
  author = 'you',
): MergeRequest {
  const st = state(sim)
  const mr: MergeRequest = {
    id: st.mrs.length + 1,
    repo: repoName,
    title,
    source,
    target,
    author,
    state: 'opened',
    createdAt: sim.now,
  }
  st.mrs.push(mr)
  return mr
}

export function mergeRequests(sim: Simulator, repoName?: string): MergeRequest[] {
  return state(sim).mrs.filter((m) => repoName === undefined || m.repo === repoName)
}

/** Merges an MR with a merge commit whose tree is the source branch's (a fast-forwardable change set). */
export function merge(sim: Simulator, id: number, author = 'you'): Commit {
  const mr = state(sim).mrs.find((m) => m.id === id)
  if (mr?.state !== 'opened') throw new Error(`merge request !${String(id)} is not open`)
  const r = repo(sim, mr.repo)
  const src = r && resolve(r, mr.source)
  const dst = r && resolve(r, mr.target)
  if (!r || !src || !dst) throw new Error('missing branch')
  const c: Commit = {
    sha: sha([mr.repo, dst.sha, src.sha, 'merge', String(sim.now)]),
    parents: [dst.sha, src.sha],
    message: `Merge branch '${mr.source}' into '${mr.target}'\n\n${mr.title}\n\nSee merge request !${String(id)}`,
    author,
    at: sim.now,
    files: { ...src.files },
  }
  r.commits[c.sha] = c
  r.branches[mr.target] = c.sha
  mr.state = 'merged'
  mr.mergedSha = c.sha
  return c
}
