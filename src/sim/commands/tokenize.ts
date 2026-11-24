/**
 * Splits a command line into pipeline stages of words, the way a POSIX shell would for the subset this
 * terminal supports: single and double quotes, backslash escapes and `|`. Never throws.
 */

export type Tokenized = { ok: true; stages: string[][] } | { ok: false; error: string }

/** Shell syntax the terminal deliberately doesn't run: chaining, redirects, substitution, background jobs. */
const UNSUPPORTED = new Map([
  ['&&', 'chaining with &&'],
  ['||', 'chaining with ||'],
  [';', 'several commands on one line (;)'],
  ['>', 'redirecting output (>)'],
  ['<', 'redirecting input (<)'],
  ['&', 'background jobs (&)'],
  ['$(', 'command substitution ($(…))'],
  ['`', 'command substitution (`…`)'],
])

export function tokenize(line: string): Tokenized {
  const stages: string[][] = [[]]
  let word = ''
  let inWord = false
  let quote: '"' | "'" | undefined
  const stage = () => stages[stages.length - 1] as string[]
  const endWord = () => {
    if (inWord) stage().push(word)
    word = ''
    inWord = false
  }
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i)
    if (quote === "'") {
      if (c === "'") quote = undefined
      else word += c
      continue
    }
    if (quote === '"') {
      if (c === '"') quote = undefined
      else if (c === '\\' && i + 1 < line.length && '"\\$`'.includes(line.charAt(i + 1)))
        word += line.charAt(++i)
      else if (c === '`' || (c === '$' && line.charAt(i + 1) === '('))
        return unsupported(c === '`' ? '`' : '$(')
      else word += c
      continue
    }
    if (c === "'" || c === '"') {
      quote = c
      inWord = true
      continue
    }
    if (c === '\\') {
      if (i + 1 < line.length) {
        word += line.charAt(++i)
        inWord = true
      }
      continue
    }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      endWord()
      continue
    }
    const two = line.slice(i, i + 2)
    if (two === '&&' || two === '||' || two === '$(') return unsupported(two)
    if (c === ';' || c === '>' || c === '<' || c === '&' || c === '`') return unsupported(c)
    if (c === '|') {
      endWord()
      if (stage().length === 0)
        return { ok: false, error: "bash: syntax error near unexpected token `|'" }
      stages.push([])
      continue
    }
    word += c
    inWord = true
  }
  if (quote)
    return { ok: false, error: `bash: unexpected EOF while looking for matching \`${quote}'` }
  endWord()
  if (stages.length > 1 && stage().length === 0)
    return { ok: false, error: "bash: syntax error near unexpected token `|'" }
  return { ok: true, stages: stages.length === 1 && stage().length === 0 ? [] : stages }
}

function unsupported(token: string): Tokenized {
  return {
    ok: false,
    error: `This terminal runs one command at a time, optionally piped into grep, head, tail or wc -l. It doesn't support ${UNSUPPORTED.get(token) ?? token}.`,
  }
}
