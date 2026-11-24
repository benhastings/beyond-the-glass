import type { Settings } from '@/progress'

export interface DisplayEnvironment {
  /** `prefers-reduced-motion: reduce` */
  reducedMotion: boolean
  /** `prefers-contrast: more` */
  moreContrast: boolean
}

export interface DisplayAttributes {
  motion: 'reduce' | 'full'
  contrast: 'more' | 'normal'
  /** Root font size: every rem-based size follows it. */
  fontSize: '100%' | '115%' | '130%'
}

/** The learner's setting wins; "system" follows the operating system's preference. */
export function displayAttributes(
  settings: Pick<Settings, 'reduceMotion' | 'highContrast' | 'textSize'>,
  env: DisplayEnvironment,
): DisplayAttributes {
  const pick = (setting: Settings['reduceMotion'], system: boolean) =>
    setting === 'on' || (setting === 'system' && system)
  return {
    motion: pick(settings.reduceMotion, env.reducedMotion) ? 'reduce' : 'full',
    contrast: pick(settings.highContrast, env.moreContrast) ? 'more' : 'normal',
    fontSize: `${String(settings.textSize)}%` as DisplayAttributes['fontSize'],
  }
}

/** Writes the attributes onto `<html>`. */
export function applyDisplay(root: HTMLElement, a: DisplayAttributes): void {
  root.dataset.motion = a.motion
  root.dataset.contrast = a.contrast
  root.style.fontSize = a.fontSize
}

export type Mood = 'console' | 'reach' | 'stormwatch'

/** Sets the page's mood and region on `<html>` (no region removes the attribute). */
export function applyTheme(root: HTMLElement, mood: Mood, region: string | undefined): void {
  root.dataset.mood = mood
  if (region) root.dataset.region = region
  else Reflect.deleteProperty(root.dataset, 'region')
}
