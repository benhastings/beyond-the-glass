import type { Simulator } from '../core/simulator.ts'
import type { FlagSpec, FlagValues } from './flags.ts'

/** What a command prints and how it ended. Pipes only see `stdout`; `stderr` always reaches the screen. */
export interface Output {
  stdout: string
  stderr: string
  exitCode: number
  /** Terminal effects for the UI: clear the screen, or close the terminal panel. */
  effect?: 'clear' | 'exit'
  /** `kubectl edit` (E6-08): the UI opens this text in its editor and calls back with the result. */
  edit?: EditRequest
}

/**
 * An object opened for editing. The terminal shows `text` in an accessible editor; Save calls `save`,
 * which either finishes (`done`, printed like any command's output) or asks for the editor to open again
 * with kubectl's error comments added (`reopen`), as `kubectl edit` does. Cancel calls `cancel`.
 */
export interface EditRequest {
  /** What is being edited, e.g. `deployment.apps/ravenpost-api`. */
  title: string
  /** The temporary file kubectl would open, for the editor's label. */
  fileName: string
  text: string
  save: (text: string) => EditStep
  cancel: () => Output
}

export type EditStep =
  | { done: Output }
  | {
      /** The text to edit again, with the errors as `#` comments at the top. */
      reopen: string
      /** The error, for the editor to announce. */
      error: string
      /** 1-based line of a syntax error in the text that was saved, if there was one. */
      line?: number
    }

/** Per-terminal state that outlives one command. */
export interface Session {
  history: string[]
  /** Supplies the active challenge's next hint (E6-10), if any. */
  hint?: () => string | undefined
  /** Records an answer to the active challenge's question (E6-10), returning what to print. */
  answer?: (question: string, text: string) => string
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
