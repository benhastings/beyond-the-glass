import { z } from 'zod'
import { commit, repo } from '../../gitops/git.ts'
import { armFailure, startPipeline } from '../../gitops/pipeline.ts'
import { CI_FAILURES } from '../../gitops/policies.ts'
import { defineTimelineEvent } from './define.ts'

/**
 * A developer pushes to an app repo and its pipeline runs (E7-02). `failure` decides how it ends; without
 * one it goes green, pushes the image and updates the deploy repo.
 */
export const pipelineEvent = defineTimelineEvent({
  type: 'pipeline',
  description:
    'Commits to an app repo and runs its CI pipeline, optionally failing in a chosen way',
  schema: z.strictObject({
    project: z.string(),
    message: z.string().default('Update parcel routes'),
    author: z.string().default('dev'),
    files: z.record(z.string(), z.string()).optional(),
    failure: z.enum(CI_FAILURES).optional(),
  }),
  apply: (sim, _cluster, p) => {
    const r = repo(sim, p.project)
    if (!r) return
    const n = Object.keys(r.commits).length
    commit(
      sim,
      p.project,
      r.defaultBranch,
      p.files ?? { 'CHANGELOG.md': `- ${p.message} (${String(n)})\n` },
      p.message,
      p.author,
    )
    startPipeline(sim, p.project, p.failure ? { failure: p.failure } : {})
  },
})

/** The next pipeline for a project (however it starts: a merge request, a push) fails this way. */
export const ciFailureEvent = defineTimelineEvent({
  type: 'ciFailure',
  description: 'Makes the next CI pipeline for a project fail in a chosen way',
  schema: z.strictObject({ project: z.string(), failure: z.enum(CI_FAILURES) }),
  apply: (sim, _cluster, p) => {
    armFailure(sim, p.project, p.failure)
  },
})
