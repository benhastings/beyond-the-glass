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

/**
 * Go's text/tabwriter as `kubectl describe` uses it (minwidth 0, padding 2): each tab ends a cell, and a
 * column is aligned across a block of consecutive lines that all have a cell there. Lines without tabs
 * end the blocks, so nested sections align on their own.
 */
export function goTabwriter(lines: readonly string[], padding = 2): string {
  const cells = lines.map((l) => l.split('\t'))
  const widths = cells.map((c) => c.map(() => 0))
  const maxCols = Math.max(0, ...cells.map((c) => c.length - 1))
  for (let col = 0; col < maxCols; col++) {
    let start = 0
    while (start < cells.length) {
      if ((cells[start]?.length ?? 0) - 1 <= col) {
        start++
        continue
      }
      let end = start
      while (end < cells.length && (cells[end]?.length ?? 0) - 1 > col) end++
      const w = Math.max(...cells.slice(start, end).map((c) => (c[col] ?? '').length)) + padding
      for (let i = start; i < end; i++) (widths[i] as number[])[col] = w
      start = end
    }
  }
  return cells
    .map((c, i) =>
      c
        .map((cell, j) => (j < c.length - 1 ? cell.padEnd((widths[i] as number[])[j] ?? 0) : cell))
        .join(''),
    )
    .join('\n')
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Go's RFC1123Z in UTC, as `kubectl describe` prints times: "Sat, 14 Mar 2026 02:10:00 +0000". */
export function rfc1123z(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${DAYS[d.getUTCDay()] ?? ''}, ${p(d.getUTCDate())} ${MONTHS[d.getUTCMonth()] ?? ''} ${String(d.getUTCFullYear())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`
}
