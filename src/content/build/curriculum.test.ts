import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { acTest } from '../../test/ac.ts'
import { allLessons } from '../manifest.ts'
import { buildManifest } from './load.ts'
const ROOT = join(import.meta.dirname, '../../..')

const { manifest } = buildManifest(join(ROOT, 'content'), {})
const harbor = allLessons(manifest).filter((l) => l.regionId === 'harbor')
const checks = harbor.flatMap((l) => l.checks)

describe('E9-02 the Harbor', () => {
  acTest(
    'E9-02.AC1',
    'has a spot-the-bug check on a Dockerfile, and a matching check on tag vs digest',
    () => {
      const bug = checks.find((c) => c.type === 'spot-the-bug' && /^FROM\s/m.test(c.code))
      expect(bug, 'a spot-the-bug check whose code is a Dockerfile').toBeDefined()
      const match = checks.find(
        (c) =>
          c.type === 'matching' &&
          c.pairs.some((p) => /tag/i.test(p.left)) &&
          c.pairs.some((p) => /digest/i.test(p.left)),
      )
      expect(match, 'a matching check pairing the tag and the digest').toBeDefined()
    },
  )

  acTest(
    'E9-02.AC2',
    'sets up ImagePullBackOff from a wrong tag, in a lesson step and a check',
    () => {
      const lesson = harbor.find((l) => l.id === 'images-and-tags')
      expect(lesson?.terms).toContain('imagepullbackoff')
      const pull = checks.find(
        (c) =>
          c.type === 'single' &&
          c.options.some((o) => o.correct && /ImagePullBackOff/.test(o.text)),
      )
      expect(pull?.prompt).toMatch(/v1\.15\.0|tag/)
    },
  )
})
