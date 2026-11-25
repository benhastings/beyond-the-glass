import { z } from 'zod'
import { defineFragment, targetSchema } from './define.ts'

/** 1. A hand-made fix that doesn't stick: self-heal puts Git's state back. */
export const driftSelfHeal = defineFragment({
  id: 'drift-self-heal',
  title: 'The fix that didn’t stick',
  situation:
    'You scale a Deployment by hand; it works, then minutes later it’s back where it was. Argo CD shows the app went out of sync and then synced itself.',
  lesson:
    'With self-heal on, Git is the only lasting way to change the cluster: Argo CD puts back any drift on its next reconcile. Change the manifest through a merge request instead.',
  params: targetSchema.extend({
    replicas: z.number().int().default(2),
    want: z.number().int().default(4),
  }),
  policy: { automated: { prune: true, selfHeal: true } },
  apply: (input) => input,
  solved: (p) => ({
    type: 'all',
    of: [
      {
        type: 'resourceState',
        resource: { kind: 'Deployment', namespace: p.namespace, name: p.deployment },
        path: 'spec.replicas',
        equals: String(p.want),
        quantifier: 'all',
      },
      { type: 'changedVia', via: 'mr', kind: 'Deployment', name: p.deployment, only: false },
    ],
  }),
  expertPaths: (p) => [
    {
      name: 'Try kubectl, see it reverted, then change Git',
      tradeOff: 'The kubectl change shows the problem; only the merge request lasts.',
      steps: [
        {
          run: `kubectl scale deployment/${p.deployment} -n ${p.namespace} --replicas=${String(p.want)}`,
        },
        { wait: '+3m' },
        { run: `kubectl get events -n argocd` },
        { run: `argocd app get ${p.app}` },
        {
          mr: {
            repo: p.repo,
            file: p.file,
            replace: [`replicas: ${String(p.replicas)}`, `replicas: ${String(p.want)}`],
            message: `Scale ${p.deployment} to ${String(p.want)}`,
          },
        },
        { wait: '+3m' },
      ],
    },
  ],
})
