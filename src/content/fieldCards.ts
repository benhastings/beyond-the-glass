import { STARTER_QUERIES } from '../sim/promql/library.ts'

/**
 * Printable field cards (E2-07): one US Letter page each, for the desk or the on-call bag. Commands use
 * placeholders in angle brackets (`<pod>`); every command is one the simulator runs, and the tests run
 * them to prove it.
 */
export interface CardItem {
  /** A command (kubectl, argocd) or a PromQL query; absent for a plain checklist line. */
  command?: string
  text: string
}

export interface CardSection {
  heading: string
  /** Numbered (a flow to follow in order) or bulleted. */
  ordered?: boolean
  items: CardItem[]
}

export interface FieldCard {
  id: string
  title: string
  intro: string
  /** What the commands are: drives how the tests check them. */
  kind: 'kubectl' | 'argocd' | 'promql' | 'checklist'
  sections: CardSection[]
}

const promql = (ids: string[]): CardItem[] =>
  ids.map((id) => {
    const q = STARTER_QUERIES.find((x) => x.id === id)
    if (!q) throw new Error(`no starter query ${id}`)
    return { command: q.query, text: `${q.title}. ${q.explanation}` }
  })

export const FIELD_CARDS: readonly FieldCard[] = [
  {
    id: 'kubectl-triage',
    title: 'kubectl triage flow',
    intro:
      'Something is down. Work from where you are to why it broke, in this order, before changing anything.',
    kind: 'kubectl',
    sections: [
      {
        heading: 'Find it',
        ordered: true,
        items: [
          {
            command: 'kubectl config current-context',
            text: 'Which cluster am I pointed at? Check before every change.',
          },
          {
            command: 'kubectl get pods -n <namespace>',
            text: 'What isn’t Running and Ready? Note RESTARTS and AGE.',
          },
          {
            command: 'kubectl get pods -n <namespace> -o wide',
            text: 'Which node is each pod on? Problems on one node point at the node.',
          },
          {
            command: 'kubectl describe pod <pod> -n <namespace>',
            text: 'Read Events at the bottom and Last State: OOMKilled, ImagePullBackOff, failed probes.',
          },
        ],
      },
      {
        heading: 'Find out why',
        ordered: true,
        items: [
          {
            command: 'kubectl logs <pod> -n <namespace> --previous',
            text: 'The last lines before it crashed (the current run may have started a moment ago).',
          },
          {
            command: 'kubectl get events -n <namespace> --sort-by=.lastTimestamp',
            text: 'Everything that happened in the namespace, newest last.',
          },
          {
            command: 'kubectl top pod -n <namespace>',
            text: 'CPU and memory now: compare with the limits in describe.',
          },
          {
            command: 'kubectl rollout history deployment/<deployment> -n <namespace>',
            text: 'Did a release go out shortly before? The newest revision is the suspect.',
          },
        ],
      },
      {
        heading: 'Fix it (the cluster may be managed by Argo CD: prefer a merge request)',
        items: [
          {
            command: 'kubectl rollout undo deployment/<deployment> -n <namespace>',
            text: 'Back to the previous revision. With Argo CD self-heal on, it will be put back: revert in Git instead.',
          },
          {
            command: 'kubectl rollout status deployment/<deployment> -n <namespace>',
            text: 'Watch the rollout finish.',
          },
        ],
      },
    ],
  },
  {
    id: 'kubectl-essentials',
    title: 'kubectl essentials',
    intro:
      'The commands an operator uses every day. Add -n <namespace>, or -A for every namespace.',
    kind: 'kubectl',
    sections: [
      {
        heading: 'Look',
        items: [
          { command: 'kubectl get pods -A', text: 'Every pod in every namespace.' },
          { command: 'kubectl get deploy,svc -n <namespace>', text: 'Several kinds at once.' },
          {
            command: 'kubectl get pods -n <namespace> -l app=<app>',
            text: 'Only pods with a label.',
          },
          {
            command: 'kubectl get deployment <deployment> -n <namespace> -o yaml',
            text: 'The whole object, as the API server has it.',
          },
          {
            command: 'kubectl describe deployment <deployment> -n <namespace>',
            text: 'Its state, conditions and events, readable.',
          },
          {
            command: 'kubectl logs deploy/<deployment> -n <namespace> --tail=50',
            text: 'The last 50 lines from one of its pods.',
          },
          { command: 'kubectl events -n <namespace> --types Warning', text: 'Only warnings.' },
          { command: 'kubectl top node', text: 'How busy each node is.' },
        ],
      },
      {
        heading: 'Change (check the context first)',
        items: [
          {
            command: 'kubectl scale deployment <deployment> -n <namespace> --replicas=3',
            text: 'More or fewer copies.',
          },
          {
            command: 'kubectl set image deployment/<deployment> <container>=<image> -n <namespace>',
            text: 'A new version: starts a rollout.',
          },
          {
            command: 'kubectl rollout restart deployment/<deployment> -n <namespace>',
            text: 'Replace every pod, one at a time.',
          },
          {
            command: 'kubectl delete pod <pod> -n <namespace>',
            text: 'Its Deployment makes a new one, with a new name.',
          },
          { command: 'kubectl diff -f <file>', text: 'What applying a file would change.' },
          { command: 'kubectl apply -f <file>', text: 'Make the cluster match the file.' },
        ],
      },
      {
        heading: 'Where am I',
        items: [
          {
            command: 'kubectl config get-contexts',
            text: 'Every context; * marks the current one.',
          },
          { command: 'kubectl config use-context <context>', text: 'Switch cluster.' },
        ],
      },
    ],
  },
  {
    id: 'argocd-essentials',
    title: 'argocd essentials',
    intro: 'Argo CD keeps the cluster matching Git. Look first; change Git when you can.',
    kind: 'argocd',
    sections: [
      {
        heading: 'Look',
        items: [
          { command: 'argocd app list', text: 'Every application, with sync and health.' },
          {
            command: 'argocd app get <app>',
            text: 'Its status, the last sync and its resources. A failed sync says why here.',
          },
          {
            command: 'argocd app diff <app>',
            text: 'What’s different between Git and the cluster (exit 1 when something is).',
          },
          { command: 'argocd app history <app>', text: 'What was deployed, and when.' },
        ],
      },
      {
        heading: 'Act',
        items: [
          {
            command: 'argocd app refresh <app>',
            text: 'Compare with Git now, rather than at the next reconcile.',
          },
          {
            command: 'argocd app sync <app>',
            text: 'Apply Git to the cluster (manual sync policy).',
          },
          {
            command: 'argocd app wait <app> --health --timeout 300',
            text: 'Wait until it’s healthy.',
          },
          {
            command: 'argocd app set <app> --sync-policy none',
            text: 'Turn auto-sync off: needed before a rollback.',
          },
          {
            command: 'argocd app rollback <app>',
            text: 'Back to the previous deploy. Git still asks for the new one: revert it there too.',
          },
        ],
      },
      {
        heading: 'Remember',
        items: [
          {
            text: 'With self-heal on, kubectl changes are put back on the next reconcile. Fix it in Git, through a merge request.',
          },
          { text: 'OutOfSync with a Failed sync: read the operation message in argocd app get.' },
        ],
      },
    ],
  },
  {
    id: 'promql-starters',
    title: 'PromQL starter queries',
    intro:
      'Paste into the metrics explorer. rate() needs a counter and a range; histogram_quantile() needs le.',
    kind: 'promql',
    sections: [
      { heading: 'Traffic and errors', items: promql(['request-rate', 'error-ratio']) },
      { heading: 'Latency', items: promql(['p99-latency', 'mean-latency']) },
      {
        heading: 'Pods and memory',
        items: promql(['restarts', 'memory-vs-limit', 'nothing-available']),
      },
    ],
  },
  {
    id: 'first-five-minutes',
    title: 'The first 5 minutes of an incident',
    intro: 'Paged? Breathe. These five minutes are for understanding, not fixing.',
    kind: 'checklist',
    sections: [
      {
        heading: 'Minute 1: own it',
        ordered: true,
        items: [
          { text: 'Acknowledge the page, so nobody else starts the same work.' },
          { text: 'Say in the incident channel that you’re looking, and what the alert says.' },
        ],
      },
      {
        heading: 'Minutes 2–3: how bad, since when',
        ordered: true,
        items: [
          {
            text: 'Open the Service Overview dashboard: which service’s errors or latency rose first, and when?',
          },
          {
            command: 'kubectl config current-context',
            text: 'Confirm which cluster you’re looking at.',
          },
          {
            command: 'argocd app history <app>',
            text: 'What changed shortly before it started? A deploy is the usual suspect.',
          },
        ],
      },
      {
        heading: 'Minutes 4–5: where',
        ordered: true,
        items: [
          { command: 'kubectl get pods -n <namespace>', text: 'Anything not Running and Ready?' },
          {
            command: 'kubectl get events -n <namespace> --sort-by=.lastTimestamp',
            text: 'The newest warnings.',
          },
          { text: 'Open a slow or failing trace: which span is slow or erroring, on which pod?' },
          {
            text: 'Write down what you know and what you’ve ruled out. Then decide: roll back, or keep digging.',
          },
        ],
      },
    ],
  },
]

/** Every command on the cards, with its card. */
export const cardCommands = () =>
  FIELD_CARDS.flatMap((c) =>
    c.sections.flatMap((s) =>
      s.items.flatMap((i) => (i.command ? [{ card: c, command: i.command }] : [])),
    ),
  )
