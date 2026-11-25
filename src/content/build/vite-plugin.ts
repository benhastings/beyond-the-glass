import { join } from 'node:path'
import type { Plugin } from 'vite'
import { buildManifest, scenarioIdsIn } from './load.ts'

const ID = 'virtual:btg-content'
const RESOLVED = `\0${ID}`

export interface ContentPluginOptions {
  /** Content root (default: `<vite root>/content`). */
  root?: string
}

/**
 * Builds the content manifest from `content/` and serves it as `virtual:btg-content`. Invalid content
 * fails the build (and the dev server) with file:line errors (E5-01.AC1). The manifest is also written
 * to `content/manifest.json` in the build output.
 */
export function contentPlugin(opts: ContentPluginOptions = {}): Plugin {
  let root = ''
  let scenarios = ''
  let challenges = ''
  let json = ''
  return {
    name: 'btg-content',
    configResolved(config) {
      root = opts.root ?? join(config.root, 'content')
      scenarios = join(config.root, 'src/scenarios')
      challenges = join(config.root, 'src/challenges')
    },
    // Built at the start of every build (and dev-server start), whether or not anything imports it yet,
    // so invalid content always fails `npm run build`.
    buildStart() {
      const { manifest, files, warnings } = buildManifest(root, {
        scenarioIds: scenarioIdsIn(scenarios),
        challengeIds: scenarioIdsIn(challenges),
      })
      for (const w of warnings) this.warn(w)
      for (const f of files) this.addWatchFile(f)
      json = JSON.stringify(manifest)
    },
    resolveId(id) {
      return id === ID ? RESOLVED : null
    },
    load(id) {
      if (id !== RESOLVED) return null
      // Rebuilt here too, so the dev server picks up edits to watched content files.
      const { manifest } = buildManifest(root, {
        scenarioIds: scenarioIdsIn(scenarios),
        challengeIds: scenarioIdsIn(challenges),
      })
      json = JSON.stringify(manifest)
      return `export default ${json}`
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'content/manifest.json', source: json })
    },
  }
}
