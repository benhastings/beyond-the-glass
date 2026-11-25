import type { Check } from '@/content/checks'

/** What every check-type component gets: its definition, the current answer and a setter. */
export interface TypeProps<C extends Check['type']> {
  check: Extract<Check, { type: C }>
  value: string[]
  onChange: (value: string[]) => void
  /** Prefix for element IDs. */
  idBase: string
}
