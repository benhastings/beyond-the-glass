// Regenerates src/app/styles/tokens.css from tokens.ts: `node scripts/build-tokens.mjs`
import { writeFileSync } from 'node:fs'
import { tokensCss } from '../src/app/styles/tokens.ts'

writeFileSync(new URL('../src/app/styles/tokens.css', import.meta.url), tokensCss())
console.log('wrote src/app/styles/tokens.css')
