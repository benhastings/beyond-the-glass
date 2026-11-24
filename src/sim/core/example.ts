/**
 * Placeholder that keeps the coverage gate honest until E6-01 lands the real simulator core:
 * clamps a value into [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) throw new RangeError(`min ${String(min)} is greater than max ${String(max)}`)
  return Math.min(max, Math.max(min, value))
}
