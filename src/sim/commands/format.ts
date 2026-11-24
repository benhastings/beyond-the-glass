/**
 * kubectl's table writer: Go's text/tabwriter with minwidth 10, tabwidth 4, padding 3 and space padding
 * (k8s.io/cli-runtime printers.GetNewTabWriter). Every column but the last is padded to the widest cell
 * plus 3, and to at least 10.
 */
export function tabwrite(rows: readonly (readonly string[])[]): string {
  const widths: number[] = []
  for (const r of rows)
    r.forEach((cell, i) => {
      if (i < r.length - 1) widths[i] = Math.max(widths[i] ?? 0, cell.length)
    })
  return rows
    .map((r) =>
      r
        .map((cell, i) =>
          i < r.length - 1 ? cell.padEnd(Math.max((widths[i] ?? 0) + 3, 10)) : cell,
        )
        .join(''),
    )
    .join('\n')
}

/**
 * kubectl's AGE format (k8s.io/apimachinery/pkg/util/duration.HumanDuration): "45s", "3m12s", "2d4h".
 */
export function humanDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < -1) return '<invalid>'
  if (seconds < 0) return '0s'
  if (seconds < 60 * 2) return `${String(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 10) {
    const s = seconds % 60
    return s === 0 ? `${String(minutes)}m` : `${String(minutes)}m${String(s)}s`
  }
  if (minutes < 60 * 3) return `${String(minutes)}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 8) {
    const m = minutes % 60
    return m === 0 ? `${String(hours)}h` : `${String(hours)}h${String(m)}m`
  }
  if (hours < 48) return `${String(hours)}h`
  if (hours < 24 * 8) {
    const h = hours % 24
    const d = Math.floor(hours / 24)
    return h === 0 ? `${String(d)}d` : `${String(d)}d${String(h)}h`
  }
  if (hours < 24 * 365 * 2) return `${String(Math.floor(hours / 24))}d`
  if (hours < 24 * 365 * 8) {
    const days = Math.floor(hours / 24)
    const y = Math.floor(days / 365)
    const dd = days % 365
    return dd === 0 ? `${String(y)}y` : `${String(y)}y${String(dd)}d`
  }
  return `${String(Math.floor(hours / 24 / 365))}y`
}
