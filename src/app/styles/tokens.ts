/**
 * Design tokens (E1-01). This file is the single source: `tokens.css` is generated from it
 * (`node scripts/build-tokens.mjs`), and `tokens.test.ts` checks every declared foreground/background pair
 * against WCAG 2.2 AA. See docs/design/art-direction.md for when to use what.
 */

export type Hex = `#${string}`

/** Roles every mood defines. Text roles must reach 4.5:1 on every surface; UI roles 3:1. */
export interface MoodPalette {
  /** Page background. */
  ground: Hex
  /** Cards, panels, the header. */
  surface: Hex
  /** A raised or highlighted panel inside a surface. */
  raised: Hex
  /** Body text. */
  ink: Hex
  /** Secondary text: captions, labels, meta. Still 4.5:1. */
  inkMuted: Hex
  /** Links and link-like controls. */
  link: Hex
  /** Borders and input boundaries (3:1). Never used for text. */
  line: Hex
  /** The focus ring (3:1 against every surface). */
  focus: Hex
  /** Primary action background, and the text on it. */
  accent: Hex
  accentInk: Hex
  /** Status colours, always paired with an icon and words. Usable as text on every surface. */
  ok: Hex
  warn: Hex
  alert: Hex
  info: Hex
}

export type Mood = 'console' | 'reach' | 'stormwatch'

export const MOODS: Record<Mood, MoodPalette> = {
  /** A dim ops room around 1998: near-black blue-grey, beige plastic, amber and green phosphor. */
  console: {
    ground: '#12151a',
    surface: '#1a1f27',
    raised: '#232a34',
    ink: '#d3d8de',
    inkMuted: '#b9c0c9',
    // Aqua is the glass. In the Console Room it marks only the glass and what you can act on
    // (links, the primary action): the one living colour in the room.
    link: '#7de8d8',
    line: '#7a8596',
    focus: '#ffd35c',
    accent: '#7de8d8',
    accentInk: '#06282b',
    ok: '#6fe0a0',
    warn: '#ffb84d',
    alert: '#ff8a78',
    info: '#7de8d8',
  },
  /** The world beyond the glass: pale mist green, deep lagoon teal ink, sun-gold. */
  reach: {
    ground: '#eef5f1',
    surface: '#ffffff',
    raised: '#e3f9f4',
    ink: '#10272c',
    inkMuted: '#2f4a4e',
    link: '#0a5a61',
    line: '#6f8a8c',
    focus: '#10272c',
    accent: '#0a5a61',
    accentInk: '#ffffff',
    ok: '#1f6b3a',
    warn: '#8a4b17',
    alert: '#a6362a',
    info: '#0a5a61',
  },
  /** The capstone's storm night: indigo, lightning yellow for focus and objectives, coral for alerts. */
  stormwatch: {
    ground: '#0e1220',
    surface: '#171c2e',
    raised: '#232a42',
    ink: '#e8ebf5',
    inkMuted: '#b4bbd3',
    link: '#7de8d8',
    line: '#7680a6',
    focus: '#ffd35c',
    accent: '#ffd35c',
    accentInk: '#0e1220',
    ok: '#8be0b4',
    warn: '#ffb84d',
    alert: '#ffa07a',
    info: '#c7a6ff',
  },
}

/** Mood-specific extras: named in the concepts, used for scenes and a few fixed elements. */
export const MOOD_EXTRAS = {
  console: {
    /** Beige CRT and tower plastic, and the dark text that sits on it. */
    plastic: '#efe9dc',
    plasticInk: '#12151a',
    phosphorAmber: '#ffb84d',
    phosphorGreen: '#6fe0a0',
    /** The glowing glass, for scenes only. */
    glass: '#7de8d8',
  },
  reach: {
    sun: '#ffb84d',
    /** Highlight background (selected pin, the "Then → Now" analogy), with ink on top. */
    sunPale: '#fff3c9',
    mist: '#e3f9f4',
    /** Panel and hairline dividers in illustrations. */
    lagoon: '#0a5a61',
  },
  stormwatch: {
    /** Panel dividers (decorative only; boundaries use `line`). */
    panel: '#39405c',
    lightning: '#ffd35c',
    coral: '#ffa07a',
  },
} as const satisfies Record<Mood, Record<string, Hex>>

/** The terminal looks the same in every mood: dark glass, light text, an aqua prompt. */
export const TERMINAL = {
  ground: '#0f1a1d',
  surface: '#1a2a2e',
  ink: '#e6efe9',
  inkMuted: '#b9c8c4',
  prompt: '#7de8d8',
  focus: '#ffd35c',
  ok: '#6fe0a0',
  warn: '#ffb84d',
  error: '#ff9b85',
  /** The `prod` context in the prompt: warning colour plus the word itself. */
  prodContext: '#ffb84d',
} as const satisfies Record<string, Hex>

export type RegionId =
  | 'console-room'
  | 'harbor'
  | 'helm-keep'
  | 'chartroom'
  | 'mirror-lake'
  | 'signalwood'
  | 'stormwatch'

export interface RegionPalette {
  /** Text-safe accent (headings, region labels, focus-adjacent marks) on Reach surfaces; white text on it. */
  accent: Hex
  /** A tint for region headers and cards, with Reach ink on top. */
  soft: Hex
  /** Illustration colours for the region's vignette (decorative; no contrast requirement). */
  motif: readonly Hex[]
  /** What the region looks like, for illustrators. */
  motifNote: string
}

export const REGIONS: Record<RegionId, RegionPalette> = {
  'console-room': {
    accent: '#0a5a61',
    soft: '#e3f9f4',
    motif: ['#7de8d8', '#efe9dc', '#ffb84d', '#6fe0a0'],
    motifNote:
      'Beige CRT and towers, the glowing glass, amber and green phosphor, a wall of status lights.',
  },
  harbor: {
    accent: '#156a70',
    soft: '#e6f4f4',
    motif: ['#156a70', '#ef7f5a', '#ffb84d', '#e3f9f4'],
    motifNote: 'Deep harbour water, stacked shipping containers in coral, gold and mist, a crane.',
  },
  'helm-keep': {
    accent: '#6f5b93',
    soft: '#ece8f4',
    motif: ['#6f5b93', '#2b2147', '#ffb84d'],
    motifNote:
      'A violet-stone keep with a gold pennant; stewards are implied by order, never drawn as people.',
  },
  chartroom: {
    accent: '#8a4b17',
    soft: '#fbeedd',
    motif: ['#b0652a', '#fff3c9', '#ffb84d'],
    motifNote: 'Brass instruments, a dome, a compass rose; charts on warm paper.',
  },
  'mirror-lake': {
    accent: '#1f6787',
    soft: '#e4f1f6',
    motif: ['#9fe6da', '#3f9d8b', '#e3f9f4', '#fffbe6'],
    motifNote: 'Still water reflecting the shore (desired state); ripple rings are drift.',
  },
  signalwood: {
    accent: '#2f6b3a',
    soft: '#e4f2e7',
    motif: ['#1f6b62', '#58c98a', '#ffd35c'],
    motifNote: 'A layered forest; gold firefly points are signals travelling between trees.',
  },
  stormwatch: {
    accent: '#3b4368',
    soft: '#e7e9f2',
    motif: ['#3b4368', '#2b2147', '#ffd35c'],
    motifNote:
      'A watchtower on a cliff under indigo cloud, one lit window, a single lightning stroke.',
  },
}

/** Typefaces (self-hosted, OFL; see src/app/styles/fonts.css). */
export const FONTS = {
  display: "'Bricolage Grotesque', 'Atkinson Hyperlegible Next', system-ui, sans-serif",
  body: "'Atkinson Hyperlegible Next', system-ui, sans-serif",
  mono: "'Atkinson Hyperlegible Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace",
} as const

/** Type scale in rem (1rem = 16px; body text is 1.125rem). Text-size settings scale the root. */
export const TYPE_SCALE = {
  xs: '0.875rem',
  sm: '1rem',
  base: '1.125rem',
  lg: '1.375rem',
  xl: '1.75rem',
  '2xl': '2.25rem',
  '3xl': '3rem',
  '4xl': '4rem',
} as const

export const LINE_HEIGHT = { body: '1.55', heading: '1.15', mono: '1.5' } as const

/** Motion: durations and easings (docs/design/art-direction.md#motion). */
export const MOTION = {
  duration: {
    instant: '0ms',
    quick: '120ms',
    base: '200ms',
    slow: '400ms',
    crossingPush: '900ms',
    crossingRipple: '1000ms',
    crossingArrive: '900ms',
    rippleStagger: '120ms',
  },
  ease: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
  },
} as const

export const SHAPE = {
  radius: { sm: '6px', md: '10px', lg: '16px', pill: '999px' },
  focusWidth: '3px',
  focusOffset: '3px',
  /** Minimum touch target (WCAG 2.5.8 asks 24px; we use 44px). */
  target: '44px',
} as const

/**
 * "More contrast" (E1-02): used when the learner turns high contrast on, or leaves it on "system" and
 * the OS asks for more contrast. Secondary text becomes full-strength, and boundaries get much stronger.
 * Text reaches 7:1 (AAA) and boundaries 4.5:1 on every surface.
 */
export const HIGH_CONTRAST: Record<
  Mood,
  Pick<MoodPalette, 'ink' | 'inkMuted' | 'line' | 'link'>
> = {
  console: { ink: '#f1f3f5', inkMuted: '#e1e5ea', line: '#b9c0c9', link: '#9ff2e7' },
  reach: { ink: '#06171a', inkMuted: '#10272c', line: '#2f4a4e', link: '#063b40' },
  stormwatch: { ink: '#f4f6fb', inkMuted: '#e8ebf5', line: '#b4bbd3', link: '#9ff2e7' },
}

// ── Contrast pairs ──────────────────────────────────────────────────────────────────────────────────

export interface ContrastPair {
  fg: Hex
  bg: Hex
  /** 4.5 for text, 3 for UI boundaries, focus rings and large text; 7 and 4.5 in high contrast. */
  min: 7 | 4.5 | 3
  where: string
}

const TEXT_ROLES = ['ink', 'inkMuted', 'link', 'ok', 'warn', 'alert', 'info'] as const
const UI_ROLES = ['line', 'focus'] as const
const SURFACES = ['ground', 'surface', 'raised'] as const

/** Every foreground/background combination the tokens allow. The contrast test checks each one. */
export function contrastPairs(): ContrastPair[] {
  const pairs: ContrastPair[] = []
  for (const [mood, p] of Object.entries(MOODS) as [Mood, MoodPalette][]) {
    for (const bg of SURFACES) {
      for (const fg of TEXT_ROLES)
        pairs.push({ fg: p[fg], bg: p[bg], min: 4.5, where: `${mood}: ${fg} on ${bg}` })
      for (const fg of UI_ROLES)
        pairs.push({ fg: p[fg], bg: p[bg], min: 3, where: `${mood}: ${fg} on ${bg}` })
    }
    pairs.push({ fg: p.accentInk, bg: p.accent, min: 4.5, where: `${mood}: accentInk on accent` })
  }
  const c = MOOD_EXTRAS.console
  pairs.push({ fg: c.plasticInk, bg: c.plastic, min: 4.5, where: 'console: plasticInk on plastic' })
  const r = MOOD_EXTRAS.reach
  for (const bg of [r.sunPale, r.sun, r.mist] as const)
    pairs.push({ fg: MOODS.reach.ink, bg, min: 4.5, where: `reach: ink on ${bg}` })
  pairs.push({ fg: MOODS.reach.link, bg: r.sunPale, min: 4.5, where: 'reach: link on sunPale' })
  for (const bg of [TERMINAL.ground, TERMINAL.surface] as const) {
    for (const fg of ['ink', 'inkMuted', 'prompt', 'ok', 'warn', 'error', 'prodContext'] as const)
      pairs.push({ fg: TERMINAL[fg], bg, min: 4.5, where: `terminal: ${fg} on ${bg}` })
    pairs.push({ fg: TERMINAL.focus, bg, min: 3, where: `terminal: focus on ${bg}` })
  }
  for (const [id, region] of Object.entries(REGIONS)) {
    for (const bg of SURFACES)
      pairs.push({
        fg: region.accent,
        bg: MOODS.reach[bg],
        min: 4.5,
        where: `${id}: accent on reach ${bg}`,
      })
    pairs.push({ fg: region.accent, bg: region.soft, min: 4.5, where: `${id}: accent on soft` })
    pairs.push({ fg: '#ffffff', bg: region.accent, min: 4.5, where: `${id}: white on accent` })
    pairs.push({ fg: MOODS.reach.ink, bg: region.soft, min: 4.5, where: `${id}: ink on soft` })
    pairs.push({
      fg: MOODS.reach.inkMuted,
      bg: region.soft,
      min: 4.5,
      where: `${id}: inkMuted on soft`,
    })
    pairs.push({ fg: MOODS.reach.line, bg: region.soft, min: 3, where: `${id}: line on soft` })
  }
  for (const [mood, hc] of Object.entries(HIGH_CONTRAST) as [
    Mood,
    (typeof HIGH_CONTRAST)[Mood],
  ][]) {
    const p = { ...MOODS[mood], ...hc }
    for (const bg of SURFACES) {
      for (const fg of ['ink', 'inkMuted', 'link'] as const)
        pairs.push({ fg: p[fg], bg: p[bg], min: 7, where: `${mood} high contrast: ${fg} on ${bg}` })
      pairs.push({ fg: p.line, bg: p[bg], min: 4.5, where: `${mood} high contrast: line on ${bg}` })
    }
  }
  return pairs
}

// ── CSS ─────────────────────────────────────────────────────────────────────────────────────────────

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

function moodVars(p: MoodPalette): string[] {
  return (Object.entries(p) as [string, Hex][]).map(([k, v]) => `  --color-${kebab(k)}: ${v};`)
}

/** The contents of tokens.css. */
export function tokensCss(): string {
  const lines: string[] = [
    '/* Generated from tokens.ts by `node scripts/build-tokens.mjs`. Do not edit by hand. */',
    '/* The default mood is the Console Room; [data-mood] and [data-region] switch palettes (E1-02). */',
    '@theme {',
    ...moodVars(MOODS.console),
    ...Object.entries(MOOD_EXTRAS).flatMap(([mood, extras]) =>
      Object.entries(extras).map(([k, v]) => `  --color-${mood}-${kebab(k)}: ${v};`),
    ),
    ...Object.entries(TERMINAL).map(([k, v]) => `  --color-term-${kebab(k)}: ${v};`),
    `  --color-region-accent: ${REGIONS['console-room'].accent};`,
    `  --color-region-soft: ${REGIONS['console-room'].soft};`,
    `  --font-display: ${FONTS.display};`,
    `  --font-sans: ${FONTS.body};`,
    `  --font-mono: ${FONTS.mono};`,
    ...Object.entries(TYPE_SCALE).map(([k, v]) => `  --text-${k}: ${v};`),
    ...Object.entries(LINE_HEIGHT).map(([k, v]) => `  --leading-${k}: ${v};`),
    ...Object.entries(MOTION.duration).map(([k, v]) => `  --duration-${kebab(k)}: ${v};`),
    ...Object.entries(MOTION.ease).map(([k, v]) => `  --ease-${k}: ${v};`),
    ...Object.entries(SHAPE.radius).map(([k, v]) => `  --radius-${k}: ${v};`),
    `  --focus-width: ${SHAPE.focusWidth};`,
    `  --focus-offset: ${SHAPE.focusOffset};`,
    `  --size-target: ${SHAPE.target};`,
    '}',
    '',
  ]
  for (const mood of ['reach', 'stormwatch'] as const) {
    lines.push(`[data-mood='${mood}'] {`, ...moodVars(MOODS[mood]), '}', '')
  }
  // High contrast outranks the mood (two attribute selectors beat one).
  for (const [mood, hc] of Object.entries(HIGH_CONTRAST)) {
    lines.push(
      `[data-contrast='more'][data-mood='${mood}'] {`,
      ...Object.entries(hc).map(([k, v]) => `  --color-${kebab(k)}: ${v};`),
      '}',
      '',
    )
  }
  for (const [id, r] of Object.entries(REGIONS)) {
    lines.push(
      `[data-region='${id}'] {`,
      `  --color-region-accent: ${r.accent};`,
      `  --color-region-soft: ${r.soft};`,
      '}',
      '',
    )
  }
  return lines.join('\n')
}
