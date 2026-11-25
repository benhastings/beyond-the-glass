import type { Simulator } from '../core/simulator.ts'
import type { Output } from './types.ts'

/**
 * What the terminal has shown (E6-09): history and scrollback, kept in the simulation's state so the
 * progress snapshot brings both back after a reload. Bounded, so a long session can't grow without end.
 */
export interface TranscriptEntry {
  /** `kind-ravenpost ▸ ravenpost`, as the prompt read when the command ran. */
  prompt: string
  command: string
  stdout: string
  stderr: string
  exitCode: number
}

export const MAX_ENTRIES = 200
export const MAX_LINES_PER_ENTRY = 500
export const MAX_HISTORY = 500

interface TranscriptState extends Record<string, unknown> {
  history: string[]
  entries: TranscriptEntry[]
}

export const transcript = (sim: Simulator) =>
  sim.state<TranscriptState>('terminal', () => ({ history: [], entries: [] }))

const clip = (text: string) => {
  const lines = text.split('\n')
  return lines.length <= MAX_LINES_PER_ENTRY
    ? text
    : [
        ...lines.slice(0, MAX_LINES_PER_ENTRY),
        `… ${String(lines.length - MAX_LINES_PER_ENTRY)} more lines not kept`,
      ].join('\n')
}

export function record(
  sim: Simulator,
  prompt: string,
  command: string,
  out: Output,
): TranscriptEntry {
  const t = transcript(sim)
  const entry = {
    prompt,
    command,
    stdout: clip(out.stdout),
    stderr: clip(out.stderr),
    exitCode: out.exitCode,
  }
  t.entries.push(entry)
  if (t.entries.length > MAX_ENTRIES) t.entries.splice(0, t.entries.length - MAX_ENTRIES)
  if (t.history.length > MAX_HISTORY) t.history.splice(0, t.history.length - MAX_HISTORY)
  return entry
}

/** `clear` and Ctrl+L: the screen empties; history stays. */
export function clearScreen(sim: Simulator): void {
  transcript(sim).entries = []
}
