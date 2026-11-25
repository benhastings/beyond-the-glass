import ravenpost from '@/scenarios/ravenpost.yaml'
import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { loadSimulation } from '../controllers'
import { createShell, record, transcript } from './index'
import { replayTo } from './replay'

describe('E6-13 timeline replay', () => {
  acTest('E6-13.AC2', 'scrubbing the timeline re-derives state deterministically', () => {
    // A live session: commands at different sim times, one of which changes the cluster.
    const sim = loadSimulation(ravenpost)
    const sh = createShell(sim)
    const lines = [
      'kubectl get pods -n ravenpost',
      'kubectl scale deploy ravenpost-web -n ravenpost --replicas=4',
      'kubectl rollout status deploy/ravenpost-web -n ravenpost',
      'clear',
      'kubectl delete pod -n ravenpost -l app=ravenpost-api',
    ]
    for (const l of lines) {
      const at = sim.now
      record(sim, 'p', l, sh.run(l), at)
      sim.advance(20_000)
    }
    const log = transcript(sim).log ?? []
    expect(log.map((c) => c.command)).toEqual(lines)
    const clusters = (s: { snapshot: () => { clusters: unknown } }) =>
      JSON.stringify(s.snapshot().clusters)
    // Replaying to "now" gives the live state; the same time always gives the same state.
    expect(clusters(replayTo(ravenpost, sim.now, log))).toBe(clusters(sim))
    for (const t of [0, 15_000, 45_000, 70_000]) {
      const a = clusters(replayTo(ravenpost, t, log))
      expect(clusters(replayTo(ravenpost, t, log)), String(t)).toBe(a)
    }
    // Going back in time undoes later commands.
    const early = replayTo(ravenpost, 10_000, log)
    expect(early.cluster().get('Deployment', 'ravenpost', 'ravenpost-web')?.spec.replicas).toBe(2)
    const later = replayTo(ravenpost, 30_000, log)
    expect(later.cluster().get('Deployment', 'ravenpost', 'ravenpost-web')?.spec.replicas).toBe(4)
    expect(replayTo(ravenpost, 0).now).toBe(0)
  })
})
