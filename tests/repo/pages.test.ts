import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { ROOT } from './helpers.ts'

interface Step {
  name?: string
  run?: string
  uses?: string
  env?: Record<string, string>
  'continue-on-error'?: boolean
}
interface Job {
  needs?: string | string[]
  steps: Step[]
  outputs?: Record<string, string>
  'continue-on-error'?: boolean
}
const wf = parse(readFileSync(join(ROOT, '.github/workflows/pages.yml'), 'utf8')) as {
  on: Record<string, unknown>
  jobs: Record<string, Job>
}

describe('E0-03 Pages deploy workflow', () => {
  it('deploys on every push to main with the Pages actions', () => {
    expect(wf.on.push).toEqual({ branches: ['main'] })
    const uses = Object.values(wf.jobs).flatMap((j) => j.steps.map((s) => s.uses ?? ''))
    for (const a of [
      'actions/configure-pages',
      'actions/upload-pages-artifact',
      'actions/deploy-pages',
    ]) {
      expect(
        uses.some((u) => u.startsWith(a)),
        a,
      ).toBe(true)
    }
  })

  it('[E0-03.AC4] runs the smoke tests against the deployed URL after deploying, and fails the workflow if they fail', () => {
    const smoke = wf.jobs.smoke
    expect(smoke?.needs).toBe('deploy')
    expect(wf.jobs.deploy?.outputs?.page_url).toBe('${{ steps.deployment.outputs.page_url }}')
    const step = smoke?.steps.find((s) => s.run?.includes('playwright test'))
    expect(step?.run).toMatch(/--grep @smoke/)
    expect(step?.env?.BASE_URL).toBe('${{ needs.deploy.outputs.page_url }}')
    expect(step?.['continue-on-error']).toBeFalsy()
    expect(smoke?.['continue-on-error']).toBeFalsy()
  })

  it('[E0-03.AC4] the smoke set includes the landing view, deep links and the third-party check', () => {
    // Ask Playwright which tests the deploy workflow's --grep @smoke selects.
    const listed = execFileSync(
      'npx',
      ['playwright', 'test', '--list', '--grep', '@smoke', '--project', 'chromium'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, BASE_URL: 'http://127.0.0.1:9/' },
      },
    )
    for (const title of [
      'landing view renders with no accessibility violations',
      '[E0-03.AC2] hard-refreshing a deep link loads the correct view',
      '[E0-03.AC2] an old path-style link redirects to its hash route',
      '[E0-03.AC3] the site makes zero requests to other origins',
    ]) {
      expect(listed, title).toContain(title)
    }
    expect(listed).not.toContain('expectNoA11yViolations fails')
    // Starting Playwright to list the tests can take longer than 5 s on a busy CI runner.
  }, 30_000)
})
