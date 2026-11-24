/**
 * Flag parsing in the style of kubectl (cobra/pflag): `--flag=value`, `--flag value`, `-n value`, `-nvalue`,
 * combined boolean shorthands (`-it`), and `--` to end flags. Never throws: problems come back as the error
 * message kubectl would print.
 */

export interface FlagSpec {
  name: string
  short?: string
  /** Whether the flag takes a value (string) or is a switch (boolean). */
  type: 'string' | 'bool'
  description: string
  /** Value suggestions for tab completion. */
  values?: readonly string[]
}

export type FlagValues = Record<string, string | boolean>

export type ParsedArgs =
  { ok: true; flags: FlagValues; positionals: string[] } | { ok: false; error: string }

export function parseArgs(argv: readonly string[], specs: readonly FlagSpec[]): ParsedArgs {
  const flags: FlagValues = {}
  const positionals: string[] = []
  const byName = new Map(specs.map((s) => [s.name, s]))
  const byShort = new Map(specs.filter((s) => s.short).map((s) => [s.short as string, s]))
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (a === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--') && a.length > 2) {
      const eq = a.indexOf('=')
      const name = eq < 0 ? a.slice(2) : a.slice(2, eq)
      const spec = byName.get(name)
      if (!spec) return { ok: false, error: `error: unknown flag: --${name}` }
      if (spec.type === 'bool') {
        const v = eq < 0 ? 'true' : a.slice(eq + 1)
        if (v !== 'true' && v !== 'false')
          return {
            ok: false,
            error: `error: invalid argument "${v}" for "--${name}" flag: strconv.ParseBool: parsing "${v}": invalid syntax`,
          }
        flags[spec.name] = v === 'true'
      } else if (eq >= 0) flags[spec.name] = a.slice(eq + 1)
      else if (i + 1 < argv.length) flags[spec.name] = argv[++i] as string
      else return { ok: false, error: `error: flag needs an argument: --${name}` }
      continue
    }
    if (a.startsWith('-') && a.length > 1) {
      for (let j = 1; j < a.length; j++) {
        const c = a.charAt(j)
        const spec = byShort.get(c)
        if (!spec) return { ok: false, error: `error: unknown shorthand flag: '${c}' in ${a}` }
        if (spec.type === 'bool') {
          flags[spec.name] = true
          continue
        }
        const rest = a.slice(j + 1).replace(/^=/, '')
        if (rest) flags[spec.name] = rest
        else if (i + 1 < argv.length) flags[spec.name] = argv[++i] as string
        else return { ok: false, error: `error: flag needs an argument: '${c}' in -${c}` }
        break
      }
      continue
    }
    positionals.push(a)
  }
  return { ok: true, flags, positionals }
}

export const str = (f: FlagValues, name: string): string | undefined => {
  const v = f[name]
  return typeof v === 'string' ? v : undefined
}

export const bool = (f: FlagValues, name: string): boolean => f[name] === true
