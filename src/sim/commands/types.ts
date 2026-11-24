import type { Simulator } from '../core/simulator.ts'
import type { FlagSpec, FlagValues } from './flags.ts'

/** What a command prints and how it ended. Pipes only see `stdout`; `stderr` always reaches the screen. */
export interface Output {
  stdout: string
  stderr: string
  exitCode: number
  /** Terminal effects for the UI: clear the screen, or close the terminal panel. */
  effect?: 'clear' | 'exit'
}

/** Per-terminal state that outlives one command. */
export interface Session {
  history: string[]
  /** Supplies the active challenge's next hint (E6-10), if any. */
  hint?: () => string | undefined
}

export interface CommandContext {
  sim: Simulator
  session: Session
}

export interface Invocation {
  /** Words after the command path, flags removed. */
  args: string[]
  flags: FlagValues
  /** The words that named the command, e.g. `['kubectl', 'get']`. */
  path: readonly string[]
}

/**
 * One command: its own file, plus one line in ./registry.ts. `match` defaults to the command path.
 */
export interface CommandDef {
  /** Words that select the command: `['kubectl', 'get']`, `['history']`. */
  path: readonly string[]
  summary: string
  usage: string
  /** Command-specific flags. kubectl commands also accept the global kubectl flags. */
  flags: readonly FlagSpec[]
  /** Finer-grained selection than the path, if two commands share one. */
  match?: (args: readonly string[]) => boolean
  run: (ctx: CommandContext, inv: Invocation) => Output
  /** Tab-completion candidates for the word being typed (`partial`), given the words before it. */
  complete?: (ctx: CommandContext, words: readonly string[], partial: string) => string[]
  /** Full help text (`<command> --help`). */
  help: () => string
}

export function defineCommand(def: CommandDef): CommandDef {
  return def
}

export const ok = (stdout: string): Output => ({ stdout, stderr: '', exitCode: 0 })
export const fail = (stderr: string, exitCode = 1): Output => ({ stdout: '', stderr, exitCode })
