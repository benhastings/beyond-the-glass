/**
 * The first five minutes of an incident (E9-11): the sequence the lesson teaches, and the printable card
 * (E2-07) is built from. A test keeps the lesson's ordering check equal to it.
 */
export interface FirstFiveStep {
  id: string
  /** The step, as the lesson's ordering check shows it. */
  title: string
  /** What the card says to do, with a command where there is one. */
  card: { command?: string; text: string }[]
}

export const FIRST_FIVE_MINUTES: readonly FirstFiveStep[] = [
  {
    id: 'acknowledge',
    title: 'Acknowledge the page, and say you’re on it',
    card: [
      { text: 'Acknowledge the page, so nobody else starts the same work.' },
      { text: 'Say in the incident channel that you’re looking, and what the alert says.' },
    ],
  },
  {
    id: 'impact',
    title: 'Assess the impact: who, how many, since when',
    card: [
      {
        text: 'Service Overview: how many requests are failing or slow, for which users, and since when?',
      },
    ],
  },
  {
    id: 'changes',
    title: 'Check what changed recently',
    card: [
      {
        command: 'argocd app history <app>',
        text: 'What changed shortly before it started? A deploy is the usual suspect.',
      },
    ],
  },
  {
    id: 'dashboards',
    title: 'Read the dashboards: which service went first',
    card: [{ text: 'Which service’s errors or latency rose first? That’s where to look.' }],
  },
  {
    id: 'traces',
    title: 'Open a trace: which span, on which pod',
    card: [{ text: 'Open a slow or failing trace: which span is slow or erroring, on which pod?' }],
  },
  {
    id: 'logs',
    title: 'Read that service’s logs',
    card: [
      {
        command: 'kubectl logs deploy/<deployment> -n <namespace> --since=10m',
        text: 'What did it say around when it started?',
      },
    ],
  },
  {
    id: 'kubectl',
    title: 'Check the pods and events with kubectl',
    card: [
      {
        command: 'kubectl config current-context',
        text: 'Confirm which cluster you’re looking at, first.',
      },
      { command: 'kubectl get pods -n <namespace>', text: 'Anything not Running and Ready?' },
      {
        command: 'kubectl get events -n <namespace> --sort-by=.lastTimestamp',
        text: 'The newest warnings.',
      },
    ],
  },
]

/** The card's three sections: which steps go in each. */
export const FIRST_FIVE_SECTIONS: readonly { heading: string; steps: string[] }[] = [
  { heading: 'Minute 1: own it', steps: ['acknowledge'] },
  { heading: 'Minutes 2–3: how bad, and what changed', steps: ['impact', 'changes'] },
  { heading: 'Minutes 4–5: where', steps: ['dashboards', 'traces', 'logs', 'kubectl'] },
]
