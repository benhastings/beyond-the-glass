import type { Plugin } from 'vite'
import { parseChallenge } from './parse.ts'

const CHALLENGE_FILE = /[\\/]src[\\/]challenges[\\/][^\\/]+\.ya?ml$/

/** Turns `src/challenges/*.yaml` imports into validated JSON modules (E6-10); invalid ones fail the build. */
export function challengePlugin(): Plugin {
  return {
    name: 'btg-challenges',
    transform(code, id) {
      const file = id.split('?')[0] ?? id
      if (!CHALLENGE_FILE.test(file)) return null
      return { code: `export default ${JSON.stringify(parseChallenge(code, file))}`, map: null }
    },
  }
}
