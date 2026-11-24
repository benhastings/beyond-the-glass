// Six hours of 15-second samples (1,440 points) for two series, from a fixed seed so runs are comparable.
export interface Point { t: number; p50: number; p99: number }
export function sixHours(): Point[] {
  let seed = 42
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32)
  const start = Date.UTC(2026, 0, 1, 0, 0, 0)
  return Array.from({ length: 1440 }, (_, i) => {
    const base = 120 + 40 * Math.sin(i / 90)
    return { t: start + i * 15_000, p50: base + rand() * 10, p99: base * 2.4 + rand() * 60 + (i > 900 && i < 960 ? 400 : 0) }
  })
}
export const fmtTime = (t: number) => new Date(t).toISOString().slice(11, 16)
