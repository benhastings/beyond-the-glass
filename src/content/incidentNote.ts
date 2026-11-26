/**
 * The incident-note rubric (E9-11): five things a good note has. Each criterion is a plain check on what
 * the learner wrote, with a tip for when it's missing. It never scores: the feedback says what's there and
 * what's worth adding.
 */
export const NOTE_SECTIONS = ['impact', 'timeline', 'evidence', 'hypothesis', 'next'] as const
export type NoteSection = (typeof NOTE_SECTIONS)[number]
export type IncidentNote = Record<NoteSection, string>

export interface Criterion {
  section: NoteSection
  label: string
  /** What the section is for, shown with its field. */
  prompt: string
  met: (text: string) => boolean
  /** What to add when it isn't met. */
  tip: string
}

export const RUBRIC: readonly Criterion[] = [
  {
    section: 'impact',
    label: 'Impact',
    prompt: 'Who is affected, and how much?',
    met: (t) =>
      /\b(users?|senders?|customers?|requests?|messages?|sends?|traffic)\b/i.test(t) &&
      /(\d|\b(all|most|some|half|none|every|no)\b)/i.test(t),
    tip: 'Say who is affected and how much: "about 8% of sends fail", not "errors are up".',
  },
  {
    section: 'timeline',
    label: 'Timeline',
    prompt: 'When did it start, and what has happened since?',
    met: (t) => /\b([01]?\d|2[0-3]):[0-5]\d\b/.test(t),
    tip: 'Give times: when it started, when you were paged, when anything changed (20:45, 20:46, …).',
  },
  {
    section: 'evidence',
    label: 'Evidence',
    prompt: 'What have you seen, and where?',
    met: (t) =>
      /\b(dashboard|panel|trace|span|log|event|kubectl|argocd|metric|p99|latency|error rate|alert|history|pods?)\b/i.test(
        t,
      ),
    tip: 'Name what you saw and where: a panel, a trace, a log line, an event, an Argo CD sync.',
  },
  {
    section: 'hypothesis',
    label: 'Hypothesis',
    prompt: 'What do you think is causing it, and why?',
    met: (t) =>
      /\b(because|caused by|due to|after|since|likely|probably|suspect|looks like)\b/i.test(t),
    tip: 'Say what you think the cause is, and why: "likely the 20:45 release, because errors began a minute after it".',
  },
  {
    section: 'next',
    label: 'Next step',
    prompt: 'What will you do next, and who will do it?',
    met: (t) =>
      /\b(roll ?back|revert|scale|page|escalate|check|watch|open|merge|restart|ask|disable|turn off|will|next)\b/i.test(
        t,
      ),
    tip: 'Say the next action and who takes it: "I’m reverting the release through a merge request; Sam watches the error rate".',
  },
]

export interface Review {
  section: NoteSection
  label: string
  met: boolean
  tip: string
}

/** Reviews a note against the rubric: what each section has, and what's worth adding. */
export function reviewNote(note: Partial<IncidentNote>): Review[] {
  return RUBRIC.map((c) => {
    const text = (note[c.section] ?? '').trim()
    return { section: c.section, label: c.label, met: text.length > 0 && c.met(text), tip: c.tip }
  })
}
