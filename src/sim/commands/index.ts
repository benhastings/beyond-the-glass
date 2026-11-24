// The terminal's command layer (E6-04): tokenizer, flag parser, command registry, built-ins and kubectl.
// Framework-free. See docs/sim/support-matrix.md.
import type { Simulator } from '../core/simulator.ts'
import { COMMANDS } from './registry.ts'
import { Shell } from './shell.ts'
import type { Session } from './types.ts'

export { COMMANDS } from './registry.ts'
export { Shell, type Completion, type ShellOptions } from './shell.ts'
export {
  defineCommand,
  ok,
  fail,
  type CommandDef,
  type CommandContext,
  type Invocation,
  type Output,
  type Session,
} from './types.ts'
export { tokenize } from './tokenize.ts'
export { parseArgs, type FlagSpec, type FlagValues } from './flags.ts'
export { editDistance, suggest } from './distance.ts'
export { tabwrite, humanDuration } from './format.ts'

/** A shell over `sim` with every registered command. */
export function createShell(sim: Simulator, session?: Session): Shell {
  return new Shell(sim, { commands: COMMANDS, ...(session ? { session } : {}) })
}
