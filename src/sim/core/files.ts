import type { Simulator } from './simulator.ts'

/**
 * The learner's home folder (E6-08): the scenario's `files`, read-only, with a working directory kept in
 * the simulation's state so it survives a reload. Paths shown to the learner are absolute under HOME.
 */
export const HOME = '/home/operator'

export type Entry = { type: 'file'; path: string; content: string } | { type: 'dir'; path: string }

const fsState = (sim: Simulator) => sim.state<{ cwd: string }>('files', () => ({ cwd: HOME }))

export const cwd = (sim: Simulator) => fsState(sim).cwd

/** Resolves `~`, `.`, `..` and relative paths against the working directory. */
export function resolvePath(sim: Simulator, p: string): string {
  const base = p.startsWith('/') ? '' : p === '~' || p.startsWith('~/') ? HOME : cwd(sim)
  const rest = p.startsWith('~') ? p.slice(1) : p
  const parts: string[] = []
  for (const seg of `${base}/${rest}`.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return `/${parts.join('/')}`
}

/** Every file, by absolute path. */
function files(sim: Simulator): Map<string, string> {
  return new Map(Object.entries(sim.scenario.files).map(([rel, c]) => [`${HOME}/${rel}`, c]))
}

/** What's at an absolute path: a file, a folder (HOME and every parent of a file), or nothing. */
export function stat(sim: Simulator, abs: string): Entry | undefined {
  const fs = files(sim)
  const content = fs.get(abs)
  if (content !== undefined) return { type: 'file', path: abs, content }
  if (
    abs === HOME ||
    [...fs.keys()].some((f) => f.startsWith(`${abs}/`)) ||
    HOME.startsWith(`${abs}/`) ||
    abs === '/'
  )
    return { type: 'dir', path: abs }
  return undefined
}

/** A folder's immediate children, sorted. */
export function list(sim: Simulator, abs: string): Entry[] {
  const prefix = abs === '/' ? '/' : `${abs}/`
  const names = new Set<string>()
  for (const f of [...files(sim).keys(), `${HOME}/`])
    if (f.startsWith(prefix)) {
      const name = f.slice(prefix.length).split('/')[0]
      if (name) names.add(name)
    }
  return [...names]
    .sort()
    .map((n) => stat(sim, `${prefix}${n}`))
    .filter((e): e is Entry => e !== undefined)
}

/** Files under a folder (all depths with `recursive`), sorted: what `kubectl apply -f DIR` reads. */
export function filesUnder(sim: Simulator, abs: string, recursive: boolean): Entry[] {
  return [...files(sim).entries()]
    .filter(
      ([p]) => p.startsWith(`${abs}/`) && (recursive || !p.slice(abs.length + 1).includes('/')),
    )
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([path, content]) => ({ type: 'file', path, content }))
}

export function changeDir(sim: Simulator, abs: string): void {
  fsState(sim).cwd = abs
}

/** `~/manifests` for paths under HOME, as a prompt or message would show them. */
export const tilde = (abs: string) =>
  abs === HOME ? '~' : abs.startsWith(`${HOME}/`) ? `~${abs.slice(HOME.length)}` : abs
