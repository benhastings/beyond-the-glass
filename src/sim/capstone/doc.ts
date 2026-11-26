import type { Act } from './script.ts'

const step = (s: Act['expertPath'][number]) =>
  'run' in s
    ? `\`${s.run}\``
    : 'wait' in s
      ? `wait ${s.wait.replace(/^\+/, '')}`
      : 'mr' in s
        ? `merge request to \`${s.mr.repo}/${s.mr.file}\`: ${s.mr.message}`
        : `revert the newest commit in \`${s.revertMr.repo}\` through a merge request`

/** The capstone's scenario doc (E10-02.AC2): per act, its evidence in every signal and its expert path. */
export function longNightDoc(acts: readonly Act[]): string {
  const out = [
    '# The Long Night: acts, evidence and expert paths',
    '',
    '<!-- Generated from src/scenarios/the-long-night.yaml by `npm run capstone-doc`. Edit the scenario, not this file. -->',
    '',
    'The capstone (E10-02) runs on the Ravenpost reference system ([`ravenpost.md`](ravenpost.md)). Each act',
    'starts when the one before it is over; its faults are timed from that moment. For each act: what the',
    'learner is told, what every signal shows, the root cause, and a path that ends it.',
    '',
  ]
  for (const a of acts) {
    out.push(
      `## ${a.clock} · ${a.title}`,
      '',
      `> ${a.narrative}`,
      '',
      '| Signal | Evidence |',
      '|---|---|',
    )
    for (const [signal, text] of Object.entries(a.evidence))
      out.push(`| ${signal} | ${text.replaceAll('|', '\\|')} |`)
    out.push('', `**Root cause:** ${a.rootCause}`, '')
    if (a.redHerring) out.push(`**Red herring:** ${a.redHerring}`, '')
    out.push(
      '**Over when:**',
      '',
      ...a.objectives.map((o) => `- ${o.text}`),
      '',
      '**Expert path:**',
      '',
      ...a.expertPath.map((s, i) => `${String(i + 1)}. ${step(s)}`),
      '',
    )
  }
  return `${out.join('\n').trimEnd()}\n`
}
