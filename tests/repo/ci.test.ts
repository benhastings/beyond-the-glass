import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { ROOT } from './helpers.ts'

interface Workflow {
  on: Record<string, unknown>
  jobs: Record<string, { name?: string; steps: { run?: string; uses?: string }[] }>
}
const workflow = (f: string) =>
  parse(readFileSync(join(ROOT, '.github/workflows', f), 'utf8')) as Workflow

const contributing = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8')
const protection =
  /^## Branch protection\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(contributing)?.[1] ?? ''
const requiredChecks = [...protection.matchAll(/^\s+- `([^`]+)`$/gm)].map((m) => m[1] ?? '')
const apiContexts = (
  JSON.parse(/<<'JSON'\n([\s\S]*?)\nJSON/.exec(protection)?.[1] ?? '{}') as {
    required_status_checks?: { contexts: string[] }
  }
).required_status_checks?.contexts

describe('E0-02 CI pipeline', () => {
  it('runs every gate the Definition of Done names, on PRs and pushes to main', () => {
    const ci = workflow('ci.yml')
    expect(Object.keys(ci.on)).toEqual(expect.arrayContaining(['pull_request', 'push']))
    const runs = Object.values(ci.jobs).flatMap((j) => j.steps.map((s) => s.run ?? ''))
    for (const cmd of [
      'npm ci',
      'npm run typecheck',
      'npm run lint',
      'npm run test',
      'npm run build',
    ]) {
      expect(
        runs.some((r) => r.startsWith(cmd)),
        cmd,
      ).toBe(true)
    }
  })

  it('[E0-02.AC3] CONTRIBUTING.md names the required checks exactly as the workflows do', () => {
    const jobNames = readdirSync(join(ROOT, '.github/workflows'))
      .filter((f) => f.endsWith('.yml'))
      .flatMap((f) => Object.entries(workflow(f).jobs).map(([id, j]) => j.name ?? id))
    expect(requiredChecks.length).toBeGreaterThan(0)
    for (const check of requiredChecks)
      expect(jobNames, `required check "${check}"`).toContain(check)
    expect(apiContexts, 'the documented API call must require the same checks').toEqual(
      requiredChecks,
    )
    // The app's own gate must be among them.
    expect(requiredChecks).toContain(workflow('ci.yml').jobs.verify?.name)
  })
})
