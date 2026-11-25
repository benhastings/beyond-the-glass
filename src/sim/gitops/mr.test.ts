import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { ChallengeRun } from '../challenges/engine'
import { challengeSchema, type Predicate } from '../challenges/schema'
import { createShell } from '../commands'
import { loadSimulation } from '../controllers'
import { scenarioSchema } from '../core/scenario'
import { miniScenarioInput } from '../core/testing'
import { application } from './argo'
import {
  mergeBlocker,
  mergeMergeRequest,
  mrPipelines,
  proposeChange,
  pushToMergeRequest,
} from './mr'
import { mrScenario, webManifest, webWithLimit } from './testing'

const settle = (sim: ReturnType<typeof mrScenario>['sim']) => {
  for (let i = 0; i < 40 && mrPipelines(sim, 1).some((p) => p.status === 'running'); i++)
    sim.advance(10_000)
}
const log = (sim: ReturnType<typeof mrScenario>['sim'], job: string) =>
  mrPipelines(sim, 1)
    .at(-1)
    ?.jobs.find((j) => j.name === job)
    ?.sections.flatMap((s) => s.lines)
    .join('\n') ?? ''
const memory = (sim: ReturnType<typeof mrScenario>['sim']) =>
  sim.cluster().get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.resources
    ?.limits?.memory

/** A challenge with one objective, evaluated against `sim`. */
const holds = (sim: ReturnType<typeof mrScenario>['sim'], check: Predicate) =>
  new ChallengeRun(
    sim,
    challengeSchema.parse({
      id: 't',
      title: 'T',
      scenario: 'mini',
      brief: 'B.',
      objectives: [{ id: 'o', text: 'o', check }],
      hints: [
        { level: 'nudge', text: 'n' },
        { level: 'pointer', text: 'p' },
        { level: 'command', text: 'c' },
      ],
      expertPath: ['pwd'],
    }),
    [],
  ).check(check)

describe('E7-03 merge requests', () => {
  it('a merge request runs lint, schema and policy checks on the changed files, and blocks merging until they pass', () => {
    const { sim } = mrScenario()
    sim.advance(180_000)
    const { mr, pipeline } = proposeChange(sim, {
      repo: 'ravenpost-deploy',
      changes: { 'shop/web.yaml': webManifest('registry.example/web:latest') },
      message: 'Use latest web',
    })
    expect(mr).toMatchObject({
      id: 1,
      source: 'you/web',
      target: 'main',
      author: 'you',
      state: 'opened',
    })
    expect(pipeline).toMatchObject({
      kind: 'validate',
      stages: ['lint', 'validate', 'policy'],
      mr: 1,
    })
    expect(mergeBlocker(sim, 1)).toMatch(/still running/)
    settle(sim)
    expect(mrPipelines(sim, 1)[0]?.status).toBe('failed')
    expect(log(sim, 'policy-check')).toMatch(
      /Deployment web: container web uses the latest tag\. Pin a version/,
    )
    expect(log(sim, 'policy-check')).toMatch(
      /Deployment web: container web has no memory limit\. Set resources\.limits\.memory/,
    )
    expect(mergeBlocker(sim, 1)).toMatch(/failed\. Fix what it reports/)
    expect(() => mergeMergeRequest(sim, 1)).toThrow(/failed/)
    // Broken YAML fails at lint, with the parser's message.
    pushToMergeRequest(sim, 1, { 'shop/web.yaml': 'kind: Deployment\n  bad: [' }, 'Oops')
    settle(sim)
    expect(log(sim, 'yaml-lint')).toMatch(/shop\/web\.yaml: error +error converting YAML to JSON/)
    expect(
      mrPipelines(sim, 1)
        .at(-1)
        ?.jobs.map((j) => j.status),
    ).toEqual(['failed', 'skipped', 'skipped'])
    // The fix passes; then it merges.
    pushToMergeRequest(
      sim,
      1,
      { 'shop/web.yaml': webWithLimit('registry.example/web:1.1', '512Mi') },
      'Pin 1.1, limit memory',
    )
    settle(sim)
    expect(mrPipelines(sim, 1)).toHaveLength(3)
    expect(log(sim, 'policy-check')).toMatch(/Checked 1 file\(s\): no problems found\./)
    expect(mergeBlocker(sim, 1)).toBeUndefined()
    const merged = mergeMergeRequest(sim, 1)
    expect(merged.message).toMatch(/^Merge branch 'you\/web' into 'main'/)
    expect(mergeBlocker(sim, 1)).toMatch(/already merged/)
    // Argo picks it up on its next reconcile.
    sim.advance(180_000)
    sim.advance(60_000)
    expect(memory(sim)).toBe('512Mi')
    expect(application(sim, 'shop')?.status.revision).toBe(merged.sha)
  })

  it('a scenario can make the next merge request fail lint or policy on purpose, with a message that teaches', () => {
    const { sim } = mrScenario({
      timeline: [{ at: '+1m', type: 'ciFailure', project: 'ravenpost-deploy', failure: 'policy' }],
    })
    sim.advance(120_000)
    proposeChange(sim, {
      repo: 'ravenpost-deploy',
      changes: { 'shop/web.yaml': webWithLimit('registry.example/web:1.1') },
      message: 'Pin 1.1',
    })
    settle(sim)
    expect(log(sim, 'policy-check')).toMatch(
      /DENIED {2}change-window: deploys to this namespace are frozen/,
    )
    // The hook applies once: the next push passes.
    pushToMergeRequest(
      sim,
      1,
      {
        'shop/config.yaml':
          'apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: web-config\ndata:\n  MODE: calm\n',
      },
      'Retry',
    )
    settle(sim)
    expect(mrPipelines(sim, 1).at(-1)?.status).toBe('success')
    const lint = mrScenario({
      timeline: [{ at: '+1m', type: 'ciFailure', project: 'ravenpost-deploy', failure: 'lint' }],
    }).sim
    lint.advance(120_000)
    proposeChange(lint, {
      repo: 'ravenpost-deploy',
      changes: { 'shop/web.yaml': webWithLimit('registry.example/web:1.1') },
      message: 'Pin 1.1',
    })
    for (let i = 0; i < 40; i++) lint.advance(10_000)
    expect(
      mrPipelines(lint, 1)[0]
        ?.jobs[0]?.sections.flatMap((x) => x.lines)
        .join('\n'),
    ).toMatch(/missing document start "---"/)
  })

  acTest(
    'E7-03.AC3',
    'challenge predicates tell "fixed via merge request" from "fixed via kubectl"',
    () => {
      const image = (sim: ReturnType<typeof mrScenario>['sim']) =>
        sim.cluster().get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.image
      const check = (via: 'mr' | 'kubectl', only = false): Predicate => ({
        type: 'changedVia',
        via,
        kind: 'Deployment',
        name: 'web',
        only,
      })
      // Via kubectl: the learner changes the live Deployment.
      const viaKubectl = mrScenario().sim
      viaKubectl.advance(180_000)
      expect(
        createShell(viaKubectl).run(
          'kubectl set image deployment/web web=registry.example/web:1.1 -n shop',
        ).exitCode,
      ).toBe(0)
      expect(image(viaKubectl)).toBe('registry.example/web:1.1')
      expect(holds(viaKubectl, check('kubectl'))).toBe(true)
      expect(holds(viaKubectl, check('mr'))).toBe(false)
      // Via a merge request: Git changes, Argo syncs it.
      const viaMr = mrScenario().sim
      viaMr.advance(180_000)
      proposeChange(viaMr, {
        repo: 'ravenpost-deploy',
        changes: { 'shop/web.yaml': webWithLimit('registry.example/web:1.1', '512Mi') },
        message: 'Web 1.1 with a memory limit',
      })
      settle(viaMr)
      expect(holds(viaMr, check('mr'))).toBe(false)
      mergeMergeRequest(viaMr, 1)
      viaMr.advance(180_000)
      expect(image(viaMr)).toBe('registry.example/web:1.1')
      expect(memory(viaMr)).toBe('512Mi')
      expect(holds(viaMr, check('mr'))).toBe(true)
      expect(holds(viaMr, check('kubectl'))).toBe(false)
      expect(holds(viaMr, check('mr', true))).toBe(true)
      // Both: `only` tells them apart.
      createShell(viaMr).run('kubectl scale deployment/web -n shop --replicas=3')
      expect(holds(viaMr, check('kubectl'))).toBe(true)
      expect(holds(viaMr, check('mr', true))).toBe(false)
      expect(holds(viaMr, check('kubectl', true))).toBe(false)
      // Argo's own adoption sync (no merge request of the learner's behind it) doesn't count.
      expect(
        holds(viaKubectl, {
          type: 'changedVia',
          via: 'mr',
          kind: 'ConfigMap',
          name: 'web-config',
          only: false,
        }),
      ).toBe(false)
    },
  )

  it('repos without CI merge straight away; errors for unknown repos and closed merge requests', () => {
    const { sim: plain } = {
      sim: loadSimulation(
        scenarioSchema.parse({
          ...miniScenarioInput(),
          gitops: { repos: { notes: { files: { 'a.md': 'a\n' } } } },
        }),
      ),
    }
    const r = proposeChange(plain, {
      repo: 'notes',
      changes: { 'a.md': 'b\n' },
      message: 'B',
      branch: 'b',
    })
    expect(r.pipeline).toBeUndefined()
    expect(mergeBlocker(plain, r.mr.id)).toBeUndefined()
    expect(mergeMergeRequest(plain, r.mr.id).files['a.md']).toBe('b\n')
    const { sim } = mrScenario()
    expect(() => proposeChange(sim, { repo: 'nope', changes: {}, message: 'x' })).toThrow(
      /no repository/,
    )
    proposeChange(sim, {
      repo: 'ravenpost-deploy',
      changes: { 'shop/config.yaml': 'x: [' },
      message: 'One',
    })
    const second = proposeChange(sim, {
      repo: 'ravenpost-deploy',
      changes: { 'shop/config.yaml': 'y: 1\n' },
      message: 'Two',
    })
    expect(second.mr.source).toBe('you/config-2')
    expect(() => pushToMergeRequest(sim, 9, {}, 'x')).toThrow(/not open/)
    expect(mergeBlocker(sim, 9)).toMatch(/no merge request/)
    // Schema errors name the object.
    const bad = proposeChange(sim, {
      repo: 'ravenpost-deploy',
      changes: { 'shop/x.yaml': 'kind: ConfigMap\nmetadata: {}\n' },
      message: 'Bad',
    })
    for (let i = 0; i < 40; i++) sim.advance(10_000)
    expect(
      mrPipelines(sim, bad.mr.id)[0]
        ?.jobs.find((j) => j.name === 'schema')
        ?.sections.flatMap((x) => x.lines)
        .join('\n'),
    ).toMatch(/ConfigMap \(no name\): missing apiVersion[\s\S]*missing metadata\.name/)
  })
})
