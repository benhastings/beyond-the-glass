import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { acTest } from '../../test/ac.ts'
import { FIELD_CARDS } from '../fieldCards.ts'
import { findModule } from '../manifest.ts'
import { buildManifest } from './load.ts'

const ROOT = join(import.meta.dirname, '../../..')
const { manifest } = buildManifest(join(ROOT, 'content'), {})
const module = findModule(manifest, 'chartroom', 'first-look')
const mdx = (id: string) =>
  readFileSync(join(ROOT, 'content/regions/chartroom/first-look', `${id}.mdx`), 'utf8')

/** Every command in a lesson's `<CodeBlock>`s, one per line. */
const commandsIn = (text: string) =>
  [...text.matchAll(/<CodeBlock[\s\S]*?code=(?:\{`([\s\S]*?)`\}|"([^"]*)")/g)].flatMap((m) =>
    (m[1] ?? m[2] ?? '').split('\n').filter((l) => l.startsWith('kubectl ')),
  )

/** What a command does, ignoring names: its verb, the kind it's about, its flags, and the tools it pipes to. */
function signature(command: string) {
  const [first = '', ...pipes] = command.split('|').map((p) => p.trim())
  const words = first.split(/\s+/)
  const verb =
    words[1] === 'config' || words[1] === 'rollout'
      ? `${words[1]} ${words[2] ?? ''}`
      : (words[1] ?? '')
  const kind = /^(get|describe)$/.test(verb) ? (words[2] ?? '').replace(/s$/, '').split('/')[0] : ''
  const flags = new Set<string>()
  for (let i = 2; i < words.length; i++) {
    const w = words[i] ?? ''
    if (!w.startsWith('-')) continue
    const name = w.split('=')[0] ?? w
    if (name === '-n' || name === '--namespace' || name === '-l' || name === '--context') i++
    else if (name === '-o') flags.add(`-o ${words[++i] ?? ''}`)
    else flags.add(name)
  }
  return { verb, kind, flags, pipes: pipes.map((p) => p.split(/\s+/)[0] ?? '') }
}

describe('E9-05 the Chartroom I', () => {
  acTest(
    'E9-05.AC1',
    'the walking-skeleton lesson is absorbed into this module, with final content',
    () => {
      expect(module?.title).toBe('kubectl essentials and safe habits')
      expect(module?.lessons.map((l) => [l.id, l.title])).toEqual([
        ['know-where-you-are', 'Know where you are'],
        ['your-first-look', 'Look before you touch'],
        ['finding-things-fast', 'Finding things fast'],
      ])
      for (const l of module?.lessons ?? []) {
        expect(l.checks.length, l.id).toBeGreaterThanOrEqual(3)
        expect(mdx(l.id), l.id).not.toMatch(/walking skeleton|placeholder|TODO|lorem/i)
      }
      expect(module?.testOut?.length).toBeGreaterThanOrEqual(3)
    },
  )

  acTest('E9-05.AC2', 'every command the module introduces is on a printable kubectl card', () => {
    const card = FIELD_CARDS.filter((c) => c.kind === 'kubectl')
      .flatMap((c) => c.sections.flatMap((s) => s.items))
      .flatMap((i) => (i.command ? [signature(i.command)] : []))
    const tools = new Set(card.flatMap((c) => c.pipes))
    const commands = (module?.lessons ?? []).flatMap((l) => commandsIn(mdx(l.id)))
    expect(commands.length).toBeGreaterThan(10)
    for (const command of commands) {
      const s = signature(command)
      const onCard = card.some(
        (c) => c.verb === s.verb && c.kind === s.kind && [...s.flags].every((f) => c.flags.has(f)),
      )
      expect(onCard, command).toBe(true)
      for (const t of s.pipes) expect(tools.has(t), `${command}: | ${t}`).toBe(true)
    }
  })
})
