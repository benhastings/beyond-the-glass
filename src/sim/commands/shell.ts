import type { Simulator } from '../core/simulator.ts'
import { suggest } from './distance.ts'
import { parseArgs, type FlagSpec } from './flags.ts'
import { GLOBAL_FLAGS, OUTPUT_FORMATS } from './kubectl/globals.ts'
import { PLANNED_KUBECTL, UNSUPPORTED_KUBECTL, unsupportedMessage } from './kubectl/unsupported.ts'
import { NOT_HERE } from './not-here.ts'
import { PIPE_COMMANDS, runPipe } from './pipes.ts'
import { tokenize } from './tokenize.ts'
import {
  fail,
  ok,
  type CommandContext,
  type CommandDef,
  type Output,
  type Session,
} from './types.ts'

/** Global kubectl flags that take a value (so the word after them isn't the verb). */
const VALUE_GLOBALS = new Set(
  GLOBAL_FLAGS.filter((f) => f.type === 'string').flatMap((f) => [
    `--${f.name}`,
    ...(f.short ? [`-${f.short}`] : []),
  ]),
)

export interface ShellOptions {
  commands: readonly CommandDef[]
  session?: Session
}

export interface Completion {
  /** The word being completed. */
  partial: string
  candidates: string[]
}

/**
 * The terminal's command interpreter: tokenizes a line, runs the command (and any pipe), and returns
 * what to print. It never throws: anything unexpected becomes a kind error message (E6 SC5).
 */
export class Shell {
  readonly sim: Simulator
  readonly session: Session
  private readonly commands: readonly CommandDef[]

  constructor(sim: Simulator, opts: ShellOptions) {
    this.sim = sim
    this.commands = opts.commands
    this.session = opts.session ?? { history: [] }
  }

  private get ctx(): CommandContext {
    return { sim: this.sim, session: this.session }
  }

  run(line: string): Output {
    try {
      if (line.trim() === '') return ok('')
      this.session.history.push(line)
      const t = tokenize(line)
      if (!t.ok) return fail(t.error, 2)
      const [first = [], ...pipes] = t.stages
      let out = this.exec(first)
      const stderr = [out.stderr]
      for (const stage of pipes) {
        out = runPipe(stage, out.stdout)
        stderr.push(out.stderr)
      }
      return { ...out, stderr: stderr.filter(Boolean).join('\n') }
    } catch (e) {
      return fail(
        `Something went wrong inside the simulator while running that command, so nothing happened. (${e instanceof Error ? e.message : String(e)})`,
      )
    }
  }

  private exec(argv: readonly string[]): Output {
    const [name = '', ...rest] = argv
    if (name === 'kubectl') return this.kubectl(rest)
    if ((PIPE_COMMANDS as readonly string[]).includes(name))
      return fail(
        `\`${name}\` reads another command's output here. Use it after a pipe, for example: kubectl get pods -A | ${name === 'wc' ? 'wc -l' : `${name} ${name === 'grep' ? 'Running' : '-n 5'}`}`,
      )
    const def = this.commands.find(
      (c) => c.path.length === 1 && c.path[0] === name && (c.match?.(rest) ?? true),
    )
    if (def) return this.invoke(def, rest, [])
    if (Object.hasOwn(NOT_HERE, name)) return fail(NOT_HERE[name] ?? '', 127)
    const close = suggest(name, this.topLevelNames())
    return fail(
      `bash: ${name}: command not found${close.length ? `\n\nDid you mean \`${close[0] ?? ''}\`?` : ''}`,
      127,
    )
  }

  private invoke(def: CommandDef, argv: readonly string[], globals: readonly FlagSpec[]): Output {
    const parsed = parseArgs(argv, [...globals, ...def.flags])
    if (!parsed.ok)
      return fail(
        def.path[0] === 'kubectl'
          ? `${parsed.error}\nSee '${def.path.join(' ')} --help' for usage.`
          : parsed.error,
      )
    if (parsed.flags.help === true) return ok(def.help())
    return def.run(this.ctx, { args: parsed.positionals, flags: parsed.flags, path: def.path })
  }

  /** Index of the kubectl verb: the first word that isn't a global flag or a global flag's value. */
  private static verbIndex(argv: readonly string[]): number {
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i] ?? ''
      if (VALUE_GLOBALS.has(a)) {
        i++
        continue
      }
      if (!a.startsWith('-')) return i
    }
    return -1
  }

  private kubectlVerbs(): string[] {
    return this.commands
      .filter((c) => c.path[0] === 'kubectl' && c.path[1])
      .map((c) => c.path[1] as string)
  }

  private kubectl(argv: readonly string[]): Output {
    const i = Shell.verbIndex(argv)
    if (i < 0) return ok(this.kubectlHelp())
    const verb = argv[i] ?? ''
    const rest = [...argv.slice(0, i), ...argv.slice(i + 1)]
    const def = this.commands.find(
      (c) => c.path[0] === 'kubectl' && c.path[1] === verb && (c.match?.(rest) ?? true),
    )
    if (def) return this.invoke(def, rest, GLOBAL_FLAGS)
    if (verb === 'help') return ok(this.kubectlHelp())
    if (
      Object.hasOwn(UNSUPPORTED_KUBECTL, verb) ||
      (PLANNED_KUBECTL as readonly string[]).includes(verb)
    )
      return fail(unsupportedMessage(verb))
    const close = suggest(verb, [
      ...this.kubectlVerbs(),
      ...PLANNED_KUBECTL,
      ...Object.keys(UNSUPPORTED_KUBECTL),
    ])
    return fail(
      `error: unknown command "${verb}" for "kubectl"${close.length ? `\n\nDid you mean this?\n${close.map((c) => `\t${c}`).join('\n')}` : ''}\n\nRun 'kubectl --help' for usage.`,
    )
  }

  private kubectlHelp(): string {
    const cmds = this.commands.filter((c) => c.path[0] === 'kubectl')
    const width = Math.max(...cmds.map((c) => (c.path[1] ?? '').length), 8) + 3
    return [
      'kubectl controls the Kubernetes cluster manager.',
      '',
      'Commands available in this simulator:',
      ...cmds.map((c) => `  ${(c.path[1] ?? '').padEnd(width)}${c.summary}`),
      '',
      'Use "kubectl <command> --help" for more information about a given command.',
    ].join('\n')
  }

  private topLevelNames(): string[] {
    return [
      'kubectl',
      ...this.commands.filter((c) => c.path.length === 1).map((c) => c.path[0] as string),
    ]
  }

  /** Candidates for the word at the end of `line` (Tab completion). Never throws. */
  complete(line: string): Completion {
    try {
      const pipeAt = line.lastIndexOf('|')
      const segment = pipeAt >= 0 ? line.slice(pipeAt + 1) : line
      const words = segment.trimStart().split(/\s+/)
      const partial = words.pop() ?? ''
      const starts = (xs: readonly string[]) =>
        [...new Set(xs)].filter((x) => x.startsWith(partial)).sort()
      if (words.length === 0)
        return {
          partial,
          candidates: starts(pipeAt >= 0 ? [...PIPE_COMMANDS] : this.topLevelNames()),
        }
      if (words[0] !== 'kubectl' || pipeAt >= 0) return { partial, candidates: [] }
      const args = words.slice(1)
      const prev = args.at(-1)
      if (prev === '-n' || prev === '--namespace')
        return { partial, candidates: starts(this.sim.cluster().namespaces()) }
      if (prev === '--context')
        return { partial, candidates: starts(this.sim.contexts.map((c) => c.name)) }
      if (prev === '-o' || prev === '--output')
        return { partial, candidates: starts(OUTPUT_FORMATS) }
      const vi = Shell.verbIndex(args)
      const def =
        vi >= 0
          ? this.commands.find((c) => c.path[0] === 'kubectl' && c.path[1] === args[vi])
          : undefined
      if (partial.startsWith('-'))
        return {
          partial,
          candidates: starts([...GLOBAL_FLAGS, ...(def?.flags ?? [])].map((f) => `--${f.name}`)),
        }
      if (vi < 0) return { partial, candidates: starts(this.kubectlVerbs()) }
      const after = [...args.slice(0, vi), ...args.slice(vi + 1)]
      return { partial, candidates: starts(def?.complete?.(this.ctx, after, partial) ?? []) }
    } catch {
      return { partial: '', candidates: [] }
    }
  }
}
