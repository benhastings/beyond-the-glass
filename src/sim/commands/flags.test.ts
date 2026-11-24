import { describe, expect, it } from 'vitest'
import { bool, parseArgs, str, type FlagSpec } from './flags'

const specs: FlagSpec[] = [
  { name: 'namespace', short: 'n', type: 'string', description: '' },
  { name: 'all-namespaces', short: 'A', type: 'bool', description: '' },
  { name: 'interactive', short: 'i', type: 'bool', description: '' },
  { name: 'tty', short: 't', type: 'bool', description: '' },
  { name: 'output', short: 'o', type: 'string', description: '' },
]

describe('parseArgs', () => {
  it('accepts every kubectl flag form', () => {
    const p = parseArgs(
      ['get', '--namespace=a', 'pods', '-it', '-owide', '--', '-not-a-flag'],
      specs,
    )
    expect(p).toEqual({
      ok: true,
      flags: { namespace: 'a', interactive: true, tty: true, output: 'wide' },
      positionals: ['get', 'pods', '-not-a-flag'],
    })
    const q = parseArgs(
      ['-n', 'b', '--output', 'name', '-A', '--all-namespaces=false', '-o=json'],
      specs,
    )
    expect(q.ok && q.flags).toEqual({ namespace: 'b', output: 'json', 'all-namespaces': false })
    if (q.ok) {
      expect(str(q.flags, 'namespace')).toBe('b')
      expect(str(q.flags, 'missing')).toBeUndefined()
      expect(bool(q.flags, 'all-namespaces')).toBe(false)
    }
    expect(parseArgs(['-', 'x'], specs)).toEqual({ ok: true, flags: {}, positionals: ['-', 'x'] })
  })

  it('reports problems the way kubectl does', () => {
    expect(parseArgs(['--nmespace', 'x'], specs)).toEqual({
      ok: false,
      error: 'error: unknown flag: --nmespace',
    })
    expect(parseArgs(['-x'], specs)).toEqual({
      ok: false,
      error: "error: unknown shorthand flag: 'x' in -x",
    })
    expect(parseArgs(['-ix'], specs)).toEqual({
      ok: false,
      error: "error: unknown shorthand flag: 'x' in -ix",
    })
    expect(parseArgs(['-n'], specs)).toEqual({
      ok: false,
      error: "error: flag needs an argument: 'n' in -n",
    })
    expect(parseArgs(['--namespace'], specs)).toEqual({
      ok: false,
      error: 'error: flag needs an argument: --namespace',
    })
    expect(parseArgs(['--all-namespaces=maybe'], specs)).toEqual({
      ok: false,
      error:
        'error: invalid argument "maybe" for "--all-namespaces" flag: strconv.ParseBool: parsing "maybe": invalid syntax',
    })
  })
})
