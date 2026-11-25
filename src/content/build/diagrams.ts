import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Diagrams (E5-02): Mermaid source in a lesson is rendered to SVG ahead of time (`npm run diagrams`, with
 * the Playwright Chromium the tests already use) and committed here, keyed by a hash of the source. The
 * build only reads the SVG, so no Mermaid code ever reaches the browser.
 */
export const DIAGRAM_DIR = join(import.meta.dirname, '../../../content/diagrams')

export const diagramHash = (source: string) =>
  createHash('sha256').update(source.trim()).digest('hex').slice(0, 16)

export function diagramSvg(source: string): string | undefined {
  const file = join(DIAGRAM_DIR, `${diagramHash(source)}.svg`)
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined
}
