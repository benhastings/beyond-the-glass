import { parse as parseYaml } from 'yaml'

/**
 * The content style lint (E5-06): learner-facing text in lessons, checks, challenges and the glossary.
 * Framework-free and pure, so every rule is unit-tested; `scripts/lint-content.mjs` runs it in CI.
 *
 * Escape hatch: a comment naming the rule on the same line or the line above, `{/* lint-allow: banned-word *\/}`
 * in MDX or `# lint-allow: banned-word` in YAML, silences that rule there. Say why in the comment.
 */
export interface Finding {
  file: string
  line: number
  rule: 'banned-word' | 'eli5-grade' | 'no-objectives' | 'image-alt' | 'step-length'
  message: string
}

/** AGENTS.md §3: words that tell a learner something should be easy for them. */
export const BANNED = [
  'simply',
  'just',
  'obviously',
  'easy',
  'easily',
  'trivial',
  'trivially',
] as const
export const ELI5_MAX_GRADE = 8
export const STEP_MAX_WORDS = 350

const BANNED_RE = new RegExp(`\\b(${BANNED.join('|')})\\b`, 'gi')

/** Lines that are code (fenced blocks), which the prose rules skip. */
function codeLines(lines: readonly string[]): Set<number> {
  const out = new Set<number>()
  let inFence = false
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) {
      out.add(i)
      inFence = !inFence
    } else if (inFence) out.add(i)
  })
  return out
}

const allowed = (lines: readonly string[], i: number, rule: string) =>
  [lines[i], lines[i - 1]].some(
    (l) => l !== undefined && new RegExp(`lint-allow:[^\\n]*\\b${rule}\\b`).test(l),
  )

/** Prose without inline code, JSX tag names, URLs or comments. */
const prose = (line: string) =>
  line
    .replace(/`[^`]*`/g, ' ')
    .replace(/\{\/\*.*?\*\/\}/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<\/?[A-Za-z][\w.]*/g, ' ')
    .replace(/\b(id|kind|scenario|challenge|language|code|src)="[^"]*"/g, ' ')

export const words = (text: string) => text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return 1
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  return Math.max(1, trimmed.match(/[aeiouy]{1,2}/g)?.length ?? 1)
}

/** Flesch-Kincaid grade level of a passage. */
export function fleschKincaid(text: string): number {
  const ws = words(text)
  if (!ws.length) return 0
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length)
  const syl = ws.reduce((n, w) => n + syllables(w), 0)
  return 0.39 * (ws.length / sentences) + 11.8 * (syl / ws.length) - 15.59
}

/** Lints one MDX lesson (front matter included). */
export function lintMdx(file: string, text: string): Finding[] {
  const lines = text.split('\n')
  const code = codeLines(lines)
  const out: Finding[] = []
  const push = (i: number, rule: Finding['rule'], message: string) => {
    if (!allowed(lines, i, rule)) out.push({ file, line: i + 1, rule, message })
  }
  // Front matter: objectives must be there and non-empty.
  const fmEnd = lines[0] === '---' ? lines.indexOf('---', 1) : -1
  if (fmEnd > 0) {
    let fm: unknown
    try {
      fm = parseYaml(lines.slice(1, fmEnd).join('\n'))
    } catch {
      fm = undefined
    }
    const objectives = (fm as { objectives?: unknown } | undefined)?.objectives
    if (!Array.isArray(objectives) || objectives.length === 0)
      push(0, 'no-objectives', 'a lesson needs objectives in its front matter')
  }
  lines.forEach((line, i) => {
    if (code.has(i) || (fmEnd > 0 && i <= fmEnd && !/^(title|objectives|\s+-)/.test(line))) return
    for (const m of prose(line).matchAll(BANNED_RE))
      push(
        i,
        'banned-word',
        `“${m[0]}” can make a learner feel slow; say what to do instead (AGENTS.md §3)`,
      )
    if (/!\[\s*\]\(/.test(line)) push(i, 'image-alt', 'image has no alt text: ![what it shows](…)')
    if (/<img\b(?![^>]*\balt="[^"]+")[^>]*>/.test(line))
      push(i, 'image-alt', '<img> needs alt text')
  })
  // ELI5 layers and eli5 callouts: grade 8 at most.
  for (const m of text.matchAll(
    /<(ELI5)>([\s\S]*?)<\/ELI5>|<Callout\s+kind="eli5"[^>]*>([\s\S]*?)<\/Callout>/g,
  )) {
    const body = (m[2] ?? m[3] ?? '').replace(/<[^>]+>/g, ' ')
    const grade = fleschKincaid(body)
    const i = text.slice(0, m.index).split('\n').length - 1
    if (grade > ELI5_MAX_GRADE)
      push(
        i,
        'eli5-grade',
        `plain-words text reads at grade ${grade.toFixed(1)}; aim for ${String(ELI5_MAX_GRADE)} or below (shorter sentences, shorter words)`,
      )
  }
  // Step length.
  for (const m of text.matchAll(/<Step\b[^>]*>([\s\S]*?)<\/Step>/g)) {
    const i = text.slice(0, m.index).split('\n').length - 1
    const bodyLines = (m[1] ?? '').split('\n')
    const bodyCode = codeLines(bodyLines)
    const n = words(
      bodyLines
        .filter((_, j) => !bodyCode.has(j))
        .map(prose)
        .join(' '),
    ).length
    if (n > STEP_MAX_WORDS)
      push(
        i,
        'step-length',
        `this step has ${String(n)} words; split it below ${String(STEP_MAX_WORDS)} so each step is one idea`,
      )
  }
  return out
}

/**
 * Lints learner-facing YAML (checks, challenges, glossary): banned words in string values, and the
 * grade of `eli5:` fields. Keys and code blocks (`code: |`) are skipped.
 */
export function lintYaml(file: string, text: string): Finding[] {
  const lines = text.split('\n')
  const out: Finding[] = []
  let blockIndent = -1
  lines.forEach((line, i) => {
    const indent = line.search(/\S/)
    if (blockIndent >= 0 && (indent > blockIndent || !line.trim())) return
    blockIndent = -1
    if (/^\s*#/.test(line)) return
    if (/^\s*(-\s+)?(code|pattern|command|expertPath|image):\s*[|>]?\s*$/.test(line)) {
      blockIndent = indent
      return
    }
    const value = line.replace(/^\s*(-\s+)?[\w-]+:\s*/, '').replace(/#.*$/, '')
    if (/^\s*(-\s+)?(id|type|pattern|scenario|question|kind|level)\s*:/.test(line)) return
    for (const m of value.replace(/`[^`]*`/g, ' ').matchAll(BANNED_RE))
      if (!allowed(lines, i, 'banned-word'))
        out.push({
          file,
          line: i + 1,
          rule: 'banned-word',
          message: `“${m[0]}” can make a learner feel slow; say what to do instead (AGENTS.md §3)`,
        })
    const eli5 = /^\s*(?:-\s+)?eli5:\s*(.+)$/.exec(line)?.[1]
    if (eli5 && fleschKincaid(eli5) > ELI5_MAX_GRADE && !allowed(lines, i, 'eli5-grade'))
      out.push({
        file,
        line: i + 1,
        rule: 'eli5-grade',
        message: `plain-words text reads at grade ${fleschKincaid(eli5).toFixed(1)}; aim for ${String(ELI5_MAX_GRADE)} or below`,
      })
  })
  return out
}
