import type { ComponentType } from 'react'

/** Every lesson's compiled MDX, loaded on demand (each its own chunk), by path relative to content/. */
const LESSONS = import.meta.glob<{ default: ComponentType }>([
  '/content/regions/**/*.mdx',
  '!/content/**/_*/**',
  '!/content/**/_*.mdx',
])

export function lessonLoader(
  file: string,
): (() => Promise<{ default: ComponentType }>) | undefined {
  return LESSONS[`/content/${file}`]
}
