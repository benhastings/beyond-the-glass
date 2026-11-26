import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { Simulator } from '@/sim/core/simulator'
import { acTest } from '@/test/ac'
import { parseScenario, ScenarioError } from './parse'
import { SCENARIOS } from './index'

const GOOD = readFileSync(new URL('./ravenpost.yaml', import.meta.url), 'utf8')

function issuesOf(text: string) {
  try {
    parseScenario(text, 'bad.yaml')
  } catch (e) {
    expect(e).toBeInstanceOf(ScenarioError)
    return (e as ScenarioError).issues
  }
  throw new Error('expected a ScenarioError')
}

describe('parseScenario', () => {
  it('parses every bundled scenario', () => {
    expect(parseScenario(GOOD, 'ravenpost.yaml').id).toBe('ravenpost')
    expect(Object.keys(SCENARIOS)).toEqual([
      'ravenpost',
      'stormwatch',
      'the-long-night',
      'triage',
      'pipelines',
      'gitops-drift',
      'gitops-manual-sync',
      'gitops-sync-failed',
      'gitops-bad-release',
    ])
  })

  acTest('E6-01.AC3', 'reports YAML syntax errors with a line number', () => {
    const [issue] = issuesOf('id: x\ntitle: [unclosed\n')
    expect(issue?.file).toBe('bad.yaml')
    expect(issue?.line).toBeGreaterThanOrEqual(2)
  })

  acTest('E6-01.AC3', 'points schema errors at the offending line and field', () => {
    const broken = GOOD.replace('replicas: 3', 'replicas: three')
    const line = GOOD.split('\n').findIndex((l) => l.includes('replicas: 3')) + 1
    const issues = issuesOf(broken)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      file: 'bad.yaml',
      line,
      path: 'clusters.0.resources.4.spec.replicas',
    })
  })

  acTest('E6-01.AC3', 'points a broken reference at its line', () => {
    const broken = GOOD.replace('deployment: ravenpost-notifier', 'deployment: ravenpost-notifer')
    const line = GOOD.split('\n').findIndex((l) => l.includes('deployment: ravenpost-notifier')) + 1
    const [issue] = issuesOf(broken)
    expect(issue).toMatchObject({ line, path: 'clusters.0.podOverrides.0.deployment' })
    expect(issue?.message).toContain('no Deployment ravenpost/ravenpost-notifer')
  })

  it('formats every issue as file:line:column', () => {
    const err = new ScenarioError([
      { file: 'f.yaml', line: 3, column: 5, path: 'id', message: 'bad' },
    ])
    expect(err.message).toBe('Invalid scenario:\n  f.yaml:3:5 id: bad')
  })

  it('reports a scenario the simulator cannot load', () => {
    const load = vi.spyOn(Simulator, 'load').mockImplementation(() => {
      throw new RangeError('boom')
    })
    try {
      expect(issuesOf(GOOD)).toEqual([
        {
          file: 'bad.yaml',
          line: 1,
          column: 1,
          path: '',
          message: 'simulator could not load it: boom',
        },
      ])
    } finally {
      load.mockRestore()
    }
  })
})
