import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { restoreSimulation } from '../controllers'
import { scenarioSchema } from '../core/scenario'
import { miniScenarioInput } from '../core/testing'
import { application, refresh } from './argo'
import { repo, resolve, shortSha } from './git'
import { pipelines, startPipeline, type Pipeline } from './pipeline'
import { hasImage } from './registry'
import { ciScenario } from './testing'

const summary = (p: Pipeline | undefined) =>
  p && {
    status: p.status,
    jobs: p.jobs.map((j) => `${j.name}:${j.status}:${String(j.durationMs)}`),
  }
const deployed = (sim: ReturnType<typeof ciScenario>['sim']) =>
  resolve(
    repo(sim, 'ravenpost-deploy') ?? { name: '', defaultBranch: 'main', branches: {}, commits: {} },
    'main',
  )?.files['shop/web.yaml']

describe('E7-02 pipelines', () => {
  acTest(
    'E7-02.AC3',
    'outcomes come from the scenario timeline, and the same scenario always runs the same way',
    () => {
      const timeline = [
        { at: '+1m', type: 'pipeline', project: 'shop-web', message: 'Add parcel tracking' },
        {
          at: '+20m',
          type: 'pipeline',
          project: 'shop-web',
          message: 'Tidy routes',
          failure: 'test',
        },
        { at: '+40m', type: 'ciFailure', project: 'shop-web', failure: 'scan' },
        { at: '+41m', type: 'pipeline', project: 'shop-web', message: 'Bump base image' },
      ]
      const runs = [ciScenario(timeline), ciScenario(timeline)]
      for (const r of runs) r.sim.advance(60 * 60_000)
      const [a, b] = runs.map((r) => pipelines(r.sim))
      expect(a?.map((p) => p.status)).toEqual(['success', 'failed', 'failed'])
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      // The failing job is the one the timeline chose; the jobs after it are skipped.
      expect(summary(a?.[1])?.jobs.map((j) => j.split(':').slice(0, 2).join(':'))).toEqual([
        'compile:success',
        'unit-tests:failed',
        'lint:success',
        'image-scan:skipped',
        'push-image:skipped',
        'update-manifests:skipped',
      ])
      expect(a?.[2]?.jobs.find((j) => j.status === 'failed')?.name).toBe('image-scan')
      // Restoring mid-run carries on identically.
      const { scenario, sim } = ciScenario(timeline)
      sim.advance(90_000)
      const restored = restoreSimulation(scenario, sim.snapshot())
      for (const s of [sim, restored]) s.advance(60 * 60_000)
      expect(JSON.stringify(pipelines(restored))).toBe(JSON.stringify(pipelines(sim)))
    },
  )

  it('a green pipeline pushes the image, updates the deploy repo, and Argo rolls it out', () => {
    const { sim } = ciScenario([{ at: '+1m', type: 'pipeline', project: 'shop-web' }])
    sim.advance(90_000)
    const p = pipelines(sim)[0]
    expect(p?.status).toBe('running')
    expect(p?.jobs.map((j) => j.status)).toEqual([
      'running',
      'created',
      'created',
      'created',
      'created',
      'created',
    ])
    expect(p?.jobs[0]?.sections.at(-1)?.lines).toEqual(['$ npm ci'])
    sim.advance(10 * 60_000)
    const done = pipelines(sim)[0]
    const tag = shortSha(done?.sha ?? '')
    expect(done).toMatchObject({
      status: 'success',
      image: `registry.example/web:${tag}`,
      deployedImage: `registry.example/web:${tag}`,
    })
    expect(hasImage(sim, `registry.example/web:${tag}`)).toBe(true)
    expect(deployed(sim)).toContain(`image: registry.example/web:${tag}`)
    expect(
      resolve(
        repo(sim, 'ravenpost-deploy') ?? {
          name: '',
          defaultBranch: 'main',
          branches: {},
          commits: {},
        },
        'main',
      ),
    ).toMatchObject({ author: 'ravenpost-ci', sha: done?.deployCommit })
    // Linked: the commit, its title, and the log's sections.
    expect(done?.title).toBe('Update parcel routes')
    const log = done?.jobs.find((j) => j.name === 'update-manifests')?.sections
    expect(log?.map((s) => s.id)).toEqual([
      'prepare_executor',
      'get_sources',
      'step_script',
      'cleanup_file_variables',
      'result',
    ])
    expect(log?.at(-1)?.lines).toEqual(['Job succeeded'])
    // Argo's next reconcile picks up the new tag.
    sim.advance(10 * 60_000)
    expect(refresh(sim, 'shop')?.status).toMatchObject({ sync: 'Synced', health: 'Healthy' })
    expect(
      sim.cluster().get('Deployment', 'shop', 'web')?.spec.template.spec.containers[0]?.image,
    ).toBe(`registry.example/web:${tag}`)
  })

  it('each failure mode fails the right job with a log that says why', () => {
    const run = (failure: string) => {
      const { sim } = ciScenario([{ at: '+1m', type: 'pipeline', project: 'shop-web', failure }])
      sim.advance(15 * 60_000)
      return { sim, p: pipelines(sim)[0] }
    }
    const lines = (p: Pipeline | undefined, job: string) =>
      p?.jobs
        .find((j) => j.name === job)
        ?.sections.flatMap((s) => s.lines)
        .join('\n') ?? ''
    expect(lines(run('test').p, 'unit-tests')).toMatch(
      /AssertionError: expected 500 to be 404[\s\S]*Tests {2}1 failed \| 186 passed[\s\S]*ERROR: Job failed/,
    )
    expect(lines(run('lint').p, 'lint')).toMatch(/1 problem \(1 error/)
    expect(lines(run('scan').p, 'image-scan')).toMatch(/CRITICAL: 1\)[\s\S]*RPSA-2026-0142/)
    const push = run('push')
    expect(lines(push.p, 'push-image')).toMatch(
      /denied: requested access to the resource is denied/,
    )
    expect(push.p?.image).toBeUndefined()
    expect(deployed(push.sim)).toContain('image: registry.example/web:1.0')
    // The bad tag: the pipeline is green, but it wrote a 7-character tag nobody pushed.
    const bad = run('bad-tag')
    const sha = bad.p?.sha ?? ''
    expect(bad.p).toMatchObject({
      status: 'success',
      image: `registry.example/web:${sha.slice(0, 8)}`,
      deployedImage: `registry.example/web:${sha.slice(0, 7)}`,
    })
    expect(lines(bad.p, 'update-manifests')).toContain('cut -c1-7')
    bad.sim.advance(10 * 60_000)
    const pods = bad.sim
      .cluster()
      .list('Pod', { namespace: 'shop' })
      .filter((x) => x.spec.containers[0]?.image.endsWith(sha.slice(0, 7)))
    expect(pods.length).toBeGreaterThan(0)
    expect(
      pods.every((x) =>
        /ErrImagePull|ImagePullBackOff/.test(
          x.status.containerStatuses?.[0]?.state.waiting?.reason ?? '',
        ),
      ),
    ).toBe(true)
    expect(application(bad.sim, 'shop')?.status.health).not.toBe('Healthy')
  })

  it('merge request pipelines, missing manifests, and scenario checks', () => {
    const { sim } = ciScenario()
    const p = startPipeline(sim, 'shop-web', { mr: 7 })
    expect(p.mr).toBe(7)
    expect(() => startPipeline(sim, 'nope')).toThrow(/no commit/)
    const base = miniScenarioInput()
    const bad = scenarioSchema.safeParse({
      ...base,
      gitops: {
        repos: {},
        ci: { web: { image: 'registry.example/web', deploy: { repo: 'd', file: 'x.yaml' } } },
      },
    })
    expect(bad.success).toBe(false)
    expect(bad.error?.issues.map((i) => i.message)).toEqual([
      'no repo named web',
      'no repo named d',
    ])
    expect(
      scenarioSchema.safeParse({
        ...base,
        gitops: { ci: { web: { image: 'web:1.0' } }, repos: { web: { files: {} } } },
      }).success,
    ).toBe(false)
  })
})
