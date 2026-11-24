const UNIT_MS = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 } as const
const PART = /(\d+)(ms|s|m|h|d)/g
const WHOLE = /^[+-]?(?:\d+(?:ms|s|m|h|d))+$/

/**
 * Parses a scenario duration such as `+4m`, `90s`, `1h30m` or `-3d` into milliseconds.
 * A leading `-` means "before scenario start". Throws on anything else.
 */
export function parseDuration(text: string): number {
  const t = text.trim()
  if (!WHOLE.test(t))
    throw new SyntaxError(`invalid duration "${text}" (examples: +4m, 90s, 1h30m, -3d)`)
  let ms = 0
  for (const [, n, unit] of t.matchAll(PART))
    ms += Number(n) * UNIT_MS[unit as keyof typeof UNIT_MS]
  return t.startsWith('-') ? -ms : ms
}

export function isDuration(text: string): boolean {
  return WHOLE.test(text.trim())
}
