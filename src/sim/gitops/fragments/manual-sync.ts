import { z } from 'zod'
import { defineFragment, targetSchema, withTimeline } from './define.ts'

/** 2. Auto-sync is off: a merged change waits in Git until someone syncs it. */
export const manualSync = defineFragment({
  id: 'manual-sync',
  title: 'Merged, but not deployed',
  situation:
    'A colleague merged a new release, but the cluster still runs the old one. Argo CD shows the app out of sync.',
  lesson:
    'Without auto-sync, merging only changes Git. Someone has to look at the diff and sync. Read `argocd app diff` first, so you know what the sync will change.',
  params: targetSchema.extend({ newTag: z.string().default('1.1') }),
  policy: 'manual',
  apply: (input, p) =>
    withTimeline(input, [
      {
        at: p.at,
        type: 'gitCommit',
        repo: p.repo,
        message: `Release ${p.deployment} ${p.newTag}`,
        replace: [{ file: p.file, from: `${p.image}:${p.tag}`, to: `${p.image}:${p.newTag}` }],
      },
    ]),
  solved: (p) => ({
    type: 'all',
    of: [
      { type: 'argoApp', app: p.app, sync: 'Synced' },
      {
        type: 'resourceState',
        resource: { kind: 'Deployment', namespace: p.namespace, name: p.deployment },
        path: 'spec.template.spec.containers[0].image',
        equals: `${p.image}:${p.newTag}`,
        quantifier: 'all',
      },
    ],
  }),
  expertPaths: (p) => [
    {
      name: 'Diff, then sync',
      tradeOff: 'A manual sync gives a person the last look before a change reaches the cluster.',
      steps: [
        { run: `argocd app get ${p.app}` },
        { run: `argocd app diff ${p.app}` },
        { run: `argocd app sync ${p.app}` },
        { wait: '+2m' },
      ],
    },
  ],
})
