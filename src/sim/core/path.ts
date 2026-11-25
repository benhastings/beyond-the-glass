/** Reads `.a.b[0].c` from an object, for `--sort-by` and challenge predicates. */
export function readPath(obj: unknown, path: string): unknown {
  const parts = path
    .replace(/^\{?\.?/, '')
    .replace(/\}$/, '')
    .split('.')
    .filter(Boolean)
  let v: unknown = obj
  for (const part of parts) {
    const m = /^([^[]+)(?:\[(\d+)\])?$/.exec(part)
    if (!m || typeof v !== 'object' || v === null) return undefined
    v = (v as Record<string, unknown>)[m[1] ?? '']
    if (m[2] !== undefined) v = Array.isArray(v) ? (v as unknown[])[Number(m[2])] : undefined
  }
  return v
}
