#!/usr/bin/env node
// Writes docs/sim/the-long-night.md from the capstone scenario (E10-02). Usage: npm run capstone-doc [-- --check]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseScenario } from '../src/scenarios/parse.ts'
import { actsOf } from '../src/sim/capstone/script.ts'
import { longNightDoc } from '../src/sim/capstone/doc.ts'

const ROOT = join(import.meta.dirname, '..')
const file = join(ROOT, 'src/scenarios/the-long-night.yaml')
const doc = longNightDoc(actsOf(parseScenario(readFileSync(file, 'utf8'), file)))
const out = join(ROOT, 'docs/sim/the-long-night.md')
if (process.argv.includes('--check')) {
  if (readFileSync(out, 'utf8') !== doc) {
    console.error('::error::docs/sim/the-long-night.md is out of date; run npm run capstone-doc')
    process.exit(1)
  }
} else writeFileSync(out, doc)
