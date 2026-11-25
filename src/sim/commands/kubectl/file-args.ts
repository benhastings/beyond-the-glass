import { filesUnder, resolvePath, stat } from '../../core/files.ts'
import type { Simulator } from '../../core/simulator.ts'

const EXTENSIONS = /\.(ya?ml|json)$/

/**
 * The files `-f` names (comma-separated, files or folders; `-R` for subfolders), as kubectl reads them,
 * or kubectl's error. `source` is the path as typed, for messages.
 */
export function manifestFiles(
  sim: Simulator,
  arg: string | undefined,
  recursive: boolean,
): { ok: true; files: { source: string; content: string }[] } | { ok: false; error: string } {
  if (arg === undefined) return { ok: false, error: 'error: must specify one of -f and -k' }
  const files: { source: string; content: string }[] = []
  for (const p of arg.split(',').filter(Boolean)) {
    if (p === '-')
      return {
        ok: false,
        error: 'error: this terminal has no stdin for -f -; save the manifest as a file',
      }
    if (/^https?:\/\//.test(p))
      return {
        ok: false,
        error: `error: this terminal can't fetch "${p}"; the manifests it can read are in your home folder (ls ~)`,
      }
    const e = stat(sim, resolvePath(sim, p))
    if (!e) return { ok: false, error: `error: the path "${p}" does not exist` }
    if (e.type === 'file') {
      files.push({ source: p, content: e.content })
      continue
    }
    const found = filesUnder(sim, e.path, recursive).filter((f) => EXTENSIONS.test(f.path))
    if (!found.length)
      return {
        ok: false,
        error: `error: error reading [${p}]: recognized file extensions are [.json .yaml .yml]`,
      }
    for (const f of found)
      if (f.type === 'file')
        files.push({
          source: `${p.replace(/\/$/, '')}/${f.path.slice(e.path.length + 1)}`,
          content: f.content,
        })
  }
  return { ok: true, files }
}
