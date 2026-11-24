import { parseDuration } from './duration.ts'

/** The default wall-clock moment a scenario starts at, when it doesn't name one. */
export const DEFAULT_START = '2026-03-14T02:10:00Z'

/**
 * Simulated time. `now` is milliseconds since the scenario started; it only moves when the
 * simulator advances it. The simulator never reads the real clock (`Date.now()`).
 */
export class SimClock {
  readonly epochMs: number
  private t: number

  constructor(startTime: string = DEFAULT_START, now = 0) {
    const epoch = Date.parse(startTime)
    if (Number.isNaN(epoch)) throw new RangeError(`invalid start time "${startTime}"`)
    this.epochMs = epoch
    this.t = now
  }

  get now(): number {
    return this.t
  }

  /** Moves time forward to `t` (ms since start). Time never goes backwards. */
  set(t: number): void {
    if (t < this.t)
      throw new RangeError(`clock cannot go backwards (${String(t)} < ${String(this.t)})`)
    this.t = t
  }

  advance(ms: number): void {
    this.set(this.t + ms)
  }

  /** RFC 3339 timestamp (second precision, like the Kubernetes API) for sim time `t` (default: now). */
  iso(t: number = this.t): string {
    return new Date(this.epochMs + t).toISOString().replace(/\.\d{3}Z$/, 'Z')
  }

  /** Resolves a scenario time: a relative duration (`-6m`, `+4m`) or an absolute RFC 3339 timestamp. */
  resolve(time: string): number {
    if (/^\d{4}-\d\d-\d\dT/.test(time)) {
      const abs = Date.parse(time)
      if (Number.isNaN(abs)) throw new RangeError(`invalid timestamp "${time}"`)
      return abs - this.epochMs
    }
    return parseDuration(time)
  }
}
