import { parseArgs } from './flags.ts'
import type { Output } from './types.ts'

/** The commands that can follow a `|`: a small subset of grep, head, tail and wc. */
export const PIPE_COMMANDS = ['grep', 'head', 'tail', 'wc'] as const

const lines = (text: string) => (text === '' ? [] : text.replace(/\n$/, '').split('\n'))

/** `-5` is shorthand for `-n 5` in head and tail. */
const countArgs = (args: readonly string[]) =>
  args.map((a) => (/^-\d+$/.test(a) ? `--lines=${a.slice(1)}` : a))

export function runPipe(argv: readonly string[], input: string): Output {
  const [cmd = '', ...rest] = argv
  switch (cmd) {
    case 'grep': {
      const p = parseArgs(rest, [
        { name: 'ignore-case', short: 'i', type: 'bool', description: '' },
        { name: 'invert-match', short: 'v', type: 'bool', description: '' },
        { name: 'extended-regexp', short: 'E', type: 'bool', description: '' },
        { name: 'count', short: 'c', type: 'bool', description: '' },
      ])
      if (!p.ok) return { stdout: '', stderr: p.error.replace(/^error: /, 'grep: '), exitCode: 2 }
      const [pattern] = p.positionals
      if (pattern === undefined)
        return { stdout: '', stderr: 'Usage: grep [OPTION]... PATTERNS', exitCode: 2 }
      const flags = p.flags['ignore-case'] === true ? 'i' : ''
      let re: RegExp
      try {
        re = new RegExp(pattern, flags)
      } catch {
        re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags)
      }
      const invert = p.flags['invert-match'] === true
      const hits = lines(input).filter((l) => re.test(l) !== invert)
      const stdout = p.flags.count === true ? String(hits.length) : hits.join('\n')
      return { stdout, stderr: '', exitCode: hits.length ? 0 : 1 }
    }
    case 'head':
    case 'tail': {
      const p = parseArgs(countArgs(rest), [
        { name: 'lines', short: 'n', type: 'string', description: '' },
      ])
      if (!p.ok) return { stdout: '', stderr: p.error.replace(/^error: /, `${cmd}: `), exitCode: 1 }
      const n = Number(p.flags.lines ?? 10)
      if (!Number.isInteger(n) || n < 0)
        return {
          stdout: '',
          stderr: `${cmd}: invalid number of lines: '${String(p.flags.lines)}'`,
          exitCode: 1,
        }
      const all = lines(input)
      return {
        stdout: (cmd === 'head' ? all.slice(0, n) : all.slice(Math.max(0, all.length - n))).join(
          '\n',
        ),
        stderr: '',
        exitCode: 0,
      }
    }
    case 'wc': {
      if (rest.length !== 1 || rest[0] !== '-l')
        return {
          stdout: '',
          stderr: 'This terminal supports `wc -l` (count lines) after a pipe.',
          exitCode: 1,
        }
      return { stdout: String(lines(input).length), stderr: '', exitCode: 0 }
    }
    default:
      return {
        stdout: '',
        stderr: `\`${cmd}\` isn't available after a pipe here. This terminal supports grep, head, tail and wc -l.`,
        exitCode: 127,
      }
  }
}
