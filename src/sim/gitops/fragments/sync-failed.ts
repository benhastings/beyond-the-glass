import { z } from 'zod'
import { defineFragment, targetSchema, withTimeline } from './define.ts'

/** 3. A change the API server refuses: the sync fails, and the operation's message says why. */
export const syncFailed = defineFragment({
  id: 'sync-failed',
  title: 'The sync that failed',
  situation:
    'A colleague changed the Deployment’s label selector. Argo CD tried to sync it and failed; the app stays out of sync.',
  lesson:
    'Some fields can’t change once an object exists: a Deployment’s selector is one. Read the sync operation’s message (`argocd app get`), then undo the change in Git.',
  params: targetSchema.extend({
    /** Text edits that make the change; the default suits a manifest with `matchLabels: { app: <name> }`. */
    breaking: z.array(z.strictObject({ from: z.string(), to: z.string() })).optional(),
  }),
  policy: { automated: { prune: true, selfHeal: false } },
  apply: (input, p) =>
    withTimeline(input, [
      {
        at: p.at,
        type: 'gitCommit',
        repo: p.repo,
        message: `Add a tier label to ${p.deployment}`,
        replace: (
          p.breaking ?? [
            {
              from: `matchLabels: { app: ${p.deployment} }`,
              to: `matchLabels: { app: ${p.deployment}, tier: front }`,
            },
            {
              from: `labels: { app: ${p.deployment} }\n    spec`,
              to: `labels: { app: ${p.deployment}, tier: front }\n    spec`,
            },
          ]
        ).map((x) => ({ file: p.file, ...x })),
      },
    ]),
  solved: (p) => ({
    type: 'all',
    of: [
      { type: 'ranCommand', pattern: `^argocd app (get|sync|history) ${p.app}\\b` },
      // Undoing the change in Git brings it back in step; the failed operation stays in the record.
      { type: 'mergedRequest', repo: p.repo },
      { type: 'argoApp', app: p.app, sync: 'Synced', health: 'Healthy' },
    ],
  }),
  expertPaths: (p) => [
    {
      name: 'Read the error, revert in Git',
      tradeOff:
        'Reverting keeps Git and the cluster in step; the selector change needs a new Deployment if it’s really wanted.',
      steps: [
        { wait: '+3m' },
        { run: `argocd app get ${p.app}` },
        { revertMr: { repo: p.repo } },
        { wait: '+3m' },
      ],
    },
  ],
})
