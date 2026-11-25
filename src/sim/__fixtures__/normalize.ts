/**
 * Masks what changes from run to run in kubectl output (E6-11): ages, hashes, IPs, timestamps, UIDs,
 * container and image IDs, node names. Fixtures are stored masked, so they hold no addresses, and the
 * simulator's output is masked the same way before structural comparison.
 */
const RULES: [RegExp, string][] = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/g, '<uid>'],
  [/(containerd|docker|cri-o):\/\/[0-9a-f]{64}/g, '$1://<id>'],
  [/sha256:[0-9a-f]{64}/g, 'sha256:<digest>'],
  [/\b\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)/g, '<time>'],
  [
    /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d\d (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d\d:\d\d:\d\d [+-]\d{4}/g,
    '<time>',
  ],
  [/\b\d{1,3}(\.\d{1,3}){3}\b/g, '<ip>'],
  [/\b(web|ravenpost-[a-z]+)-[a-z0-9]{8,10}-[a-z0-9]{5}\b/g, '$1-<hash>-<id>'],
  [/\b(web|ravenpost-[a-z]+)-[a-z0-9]{8,10}\b/g, '$1-<hash>'],
  [/\bkube-api-access-[a-z0-9]{5}\b/g, 'kube-api-access-<id>'],
  [/pod-template-hash([=:] ?)"?[a-z0-9]{8,10}"?/g, 'pod-template-hash$1<hash>'],
  [/\b[\w-]+-(control-plane|worker\d*)\b/g, '<node>'],
  [/\b(dev-(cp|w\d))\b/g, '<node>'],
  [/resourceVersion: "\d+"/g, 'resourceVersion: "<rv>"'],
  [/(\(x\d+ over )[\dsmhd]+\)/g, '$1<age>)'],
  [/(?<![\w./-])\d+[smhd](\d+[smh])?(?![\w/])/g, '<age>'],
  [/\b(\d+) \(<age> ago\)/g, '$1 (<age> ago)'],
]

export function mask(text: string): string {
  let out = text
  for (const [re, to] of RULES) out = out.replace(re, to)
  return out
}

const cells = (line: string) => line.trim().split(/\s{2,}/)

/** A table's header columns. */
export const tableHeader = (text: string) => cells(text.split('\n')[0] ?? '')

/** A table's rows, as cells (masked text keeps columns apart by two or more spaces). */
export const tableRows = (text: string) =>
  text
    .split('\n')
    .slice(1)
    .filter((l) => l.trim())
    .map(cells)

/** `describe` output's top-level section names, in order. */
export const describeSections = (text: string) =>
  text
    .split('\n')
    .map((l) => /^([A-Z][\w -]*?):/.exec(l)?.[1])
    .filter((s): s is string => s !== undefined)

/** Every `Reason:` value in `describe` output (container states), in order. */
export const describeReasons = (text: string) =>
  [...text.matchAll(/^\s+Reason:\s+(\S+)/gm)].map((m) => m[1] ?? '')

/** The REASON column of an events table (`get events`) or the Reason column of describe's Events. */
export function eventReasons(text: string): string[] {
  const lines = text.split('\n')
  const head = lines.findIndex((l) => /\bREASON\b|^\s+Type\s+Reason\b/.test(l))
  if (head < 0) return []
  const header = cells(lines[head] ?? '')
  const col = header.findIndex((h) => h === 'REASON' || h === 'Reason')
  return lines
    .slice(head + 1)
    .filter((l) => l.trim() && !/^\s+----/.test(l))
    .map((l) => cells(l)[col] ?? '')
}
