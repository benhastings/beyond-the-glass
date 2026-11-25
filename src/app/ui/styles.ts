/** Shared class lists, so every control draws focus and targets the same way (art-direction.md#shape-and-focus). */
export const focusRing =
  'outline-none focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-focus focus-visible:outline-solid'

/** At least 44 × 44 px (WCAG 2.5.8 asks 24; we use 44). */
export const target = 'min-h-11 min-w-11'

export const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')
