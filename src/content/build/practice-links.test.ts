import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { allLessons } from '../manifest.ts'
import { buildManifest, practiceLinkErrors } from './load.ts'
import { contentPlugin } from './vite-plugin.ts'

const ROOT = join(import.meta.dirname, '../../..')
const tmp = mkdtempSync(join(tmpdir(), 'btg-practice-'))
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('E10-05 practice-next links', () => {
  acTest(
    'E10-05.AC2',
    'every act’s "practice next" lesson exists, and a missing one fails the build',
    () => {
      // The real scenarios against the real lessons.
      const { manifest } = buildManifest(join(ROOT, 'content'), {})
      const ids = allLessons(manifest).map((l) => l.id)
      expect(practiceLinkErrors(ids, join(ROOT, 'src/scenarios'))).toEqual([])

      // A scenario naming a lesson that isn't there: the content plugin stops the build, naming it.
      cpSync(join(ROOT, 'content'), join(tmp, 'content'), { recursive: true })
      cpSync(join(ROOT, 'src/scenarios'), join(tmp, 'src/scenarios'), { recursive: true })
      mkdirSync(join(tmp, 'src/challenges'), { recursive: true })
      cpSync(join(ROOT, 'src/challenges'), join(tmp, 'src/challenges'), { recursive: true })
      writeFileSync(
        join(tmp, 'src/scenarios/night.yaml'),
        'id: night\nacts:\n  - id: one\n    title: One\n    practice: [your-first-look, no-such-lesson]\n',
      )
      expect(practiceLinkErrors(ids, join(tmp, 'src/scenarios'))).toEqual([
        'src/scenarios/night.yaml: act "one" suggests practising lesson "no-such-lesson", which doesn\'t exist',
      ])
      const plugin = contentPlugin()
      const hooks = plugin as unknown as {
        configResolved: (c: { root: string }) => void
        buildStart: (this: unknown) => void
      }
      hooks.configResolved({ root: tmp })
      const ctx = {
        warn: () => undefined,
        addWatchFile: () => undefined,
        error: (m: string) => {
          throw new Error(m)
        },
      }
      expect(() => {
        hooks.buildStart.call(ctx)
      }).toThrow(
        /^src\/scenarios\/night\.yaml: act "one" suggests practising lesson "no-such-lesson"/,
      )
      expect(practiceLinkErrors(ids, join(tmp, 'nowhere'))).toEqual([])
    },
  )
})
