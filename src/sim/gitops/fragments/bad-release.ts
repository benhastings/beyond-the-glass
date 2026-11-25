import { z } from 'zod'
import { defineFragment, targetSchema, withTimeline } from './define.ts'

/** 4. A bad release: roll back through Git (revert) or through Argo CD (rollback, with auto-sync off). */
export const badRelease = defineFragment({
  id: 'bad-release',
  title: 'Roll it back',
  situation:
    'A release went out with an image tag that doesn’t exist. New pods can’t pull it; the rollout stalls and Argo CD shows the app Degraded.',
  lesson:
    'Two ways back. Reverting the commit through a merge request keeps Git true, and auto-sync deploys the revert. `argocd app rollback` is faster, but only works with auto-sync off, and leaves Git still asking for the bad release until someone reverts it.',
  params: targetSchema.extend({ badTag: z.string().default('1.2-rc') }),
  policy: { automated: { prune: true, selfHeal: true } },
  apply: (input, p) => ({
    ...withTimeline(input, [
      {
        at: p.at,
        type: 'gitCommit',
        repo: p.repo,
        message: `Release ${p.deployment} ${p.badTag}`,
        replace: [{ file: p.file, from: `${p.image}:${p.tag}`, to: `${p.image}:${p.badTag}` }],
      },
    ]),
    images: { ...input.images, [`${p.image}:${p.badTag}`]: { pull: 'notFound' } },
  }),
  solved: (p) => ({
    type: 'all',
    of: [
      { type: 'argoApp', app: p.app, health: 'Healthy' },
      {
        type: 'resourceState',
        resource: { kind: 'Deployment', namespace: p.namespace, name: p.deployment },
        path: 'spec.template.spec.containers[0].image',
        equals: `${p.image}:${p.tag}`,
        quantifier: 'all',
      },
    ],
  }),
  expertPaths: (p) => [
    {
      name: 'Revert through Git',
      tradeOff:
        'Git stays the truth and auto-sync stays on; it takes a merge request and a pipeline, so it’s slower.',
      steps: [
        { run: `argocd app get ${p.app}` },
        { run: `kubectl get pods -n ${p.namespace}` },
        { revertMr: { repo: p.repo } },
        { wait: '+4m' },
      ],
    },
    {
      name: 'Argo CD rollback',
      tradeOff:
        'Fastest way back, but auto-sync has to go off first, and Git still asks for the bad release: revert it before turning auto-sync on again.',
      steps: [
        { run: `argocd app get ${p.app}` },
        { run: `argocd app set ${p.app} --sync-policy none` },
        { run: `argocd app history ${p.app}` },
        { run: `argocd app rollback ${p.app}` },
        { wait: '+2m' },
      ],
    },
  ],
})
