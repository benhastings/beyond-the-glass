import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { parse as parseYaml } from 'yaml'
import { bankSchema, type Bank } from '../../placement/bank.ts'

const BANK = /[\\/]content[\\/]threshold[\\/]bank\.ya?ml$/

/** Validates `content/threshold/bank.yaml`, throwing `file path: message` for every problem. */
export function parseBank(text: string, file: string): Bank {
  const r = bankSchema.safeParse(parseYaml(text))
  if (!r.success)
    throw new Error(
      `Invalid question bank:\n${r.error.issues.map((i) => `  ${file} ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    )
  return r.data
}

/**
 * The Threshold's question bank (E4-01): validated at the start of every build, whether or not anything
 * imports it yet, and turned into a JSON module when imported.
 */
export function thresholdPlugin(): Plugin {
  let file = ''
  return {
    name: 'btg-threshold',
    configResolved(config) {
      file = join(config.root, 'content/threshold/bank.yaml')
    },
    buildStart() {
      this.addWatchFile(file)
      parseBank(readFileSync(file, 'utf8'), 'content/threshold/bank.yaml')
    },
    transform(code, id) {
      const f = id.split('?')[0] ?? id
      if (!BANK.test(f)) return null
      return { code: `export default ${JSON.stringify(parseBank(code, f))}`, map: null }
    },
  }
}
