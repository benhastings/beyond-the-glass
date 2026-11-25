/** Kubernetes resource quantities: CPU in millicores, memory in bytes. Unparseable values count as 0. */

export function cpuMillis(q: string | undefined): number {
  if (!q) return 0
  const m = /^(\d+(?:\.\d+)?)(m?)$/.exec(q.trim())
  if (!m) return 0
  const n = Number(m[1])
  return Math.round(m[2] === 'm' ? n : n * 1000)
}

const MEMORY_UNITS: Record<string, number> = {
  '': 1,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
}

export function memoryBytes(q: string | undefined): number {
  if (!q) return 0
  const m = /^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti|k|M|G|T)?$/.exec(q.trim())
  if (!m) return 0
  return Math.round(Number(m[1]) * (MEMORY_UNITS[m[2] ?? ''] ?? 1))
}
