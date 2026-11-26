import type { Plugin } from 'vite'
import { parseScenario } from './parse.ts'

const SCENARIO_FILE = /[\\/]src[\\/]scenarios[\\/][^\\/]+\.ya?ml$/

/**
 * Turns `src/scenarios/*.yaml` imports into validated JSON modules. An invalid scenario fails the
 * build (and the dev server) with file:line errors (E6-01.AC3).
 */
export function scenarioPlugin(): Plugin {
  return {
    name: 'btg-scenarios',
    transform(code, id) {
      const file = id.split('?')[0] ?? id
      if (!SCENARIO_FILE.test(file)) return null
      // A scenario that extends another is rebuilt when its base changes.
      const scenario = parseScenario(code, file, (base) => {
        this.addWatchFile(base)
      })
      return { code: `export default ${JSON.stringify(scenario)}`, map: null }
    },
  }
}
