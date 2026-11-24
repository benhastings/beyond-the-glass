import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import {
  CODE_ERRORS,
  CODE_PREFIX,
  crc32,
  decodeProgress,
  encodeProgress,
  exportable,
  exportFile,
  exportFileName,
  fromBase64Url,
  importText,
  parseProgressJson,
  toBase64Url,
} from './codec'
import {
  CHALLENGE_STATUSES,
  DEPTHS,
  emptyProgress,
  LEVELS,
  progressV1,
  type Progress,
} from './schema'

const NOW = '2026-11-24T12:00:00.000Z'
const utf8 = new TextEncoder()

// ── Generators for valid progress records ───────────────────────────────────────────────────────────
const word = fc.stringMatching(/^[a-z0-9]{1,8}$/)
const id = fc.array(word, { minLength: 1, maxLength: 4 }).map((ws) => ws.join('-'))
const time = fc
  .date({
    min: new Date('2025-01-01T00:00:00Z'),
    max: new Date('2030-01-01T00:00:00Z'),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString())
const count = fc.nat({ max: 50 })
const answer = fc.oneof(
  fc.string({ maxLength: 40 }),
  fc.array(fc.string({ maxLength: 10 }), { maxLength: 4 }),
)
const opt = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: undefined })
const strip = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

const progressArb: fc.Arbitrary<Progress> = fc
  .record({
    createdAt: time,
    updatedAt: time,
    displayName: opt(fc.stringMatching(/^[A-Za-z][A-Za-z .'-]{0,30}[A-Za-z]$/)),
    threshold: fc.record({
      answers: fc.dictionary(id, answer, { maxKeys: 12 }),
      completedAt: opt(time),
      placement: opt(fc.dictionary(id, fc.constantFrom(...LEVELS), { maxKeys: 5 })),
      overrides: fc.dictionary(id, fc.constantFrom(...LEVELS), { maxKeys: 5 }),
      startRegion: opt(id),
    }),
    lessons: fc.dictionary(
      id,
      fc.record({
        currentStep: count,
        completedSteps: fc.uniqueArray(id, { maxLength: 6 }),
        completedAt: opt(time),
        depth: opt(fc.constantFrom(...DEPTHS)),
      }),
      { maxKeys: 20 },
    ),
    checks: fc.dictionary(
      id,
      fc.record({ attempts: count, passed: fc.boolean(), lastAnswer: opt(answer) }),
      { maxKeys: 20 },
    ),
    challenges: fc.dictionary(
      id,
      fc.record({
        status: fc.constantFrom(...CHALLENGE_STATUSES),
        hintsUsed: fc.nat({ max: 3 }),
        commandsRun: count,
        completedAt: opt(time),
      }),
      { maxKeys: 10 },
    ),
    scenarios: fc.dictionary(
      id,
      fc.record({ act: opt(fc.nat({ max: 4 })), notes: opt(fc.string({ maxLength: 200 })) }),
      { maxKeys: 3 },
    ),
    settings: fc.record({
      reduceMotion: fc.constantFrom('system', 'on', 'off'),
      highContrast: fc.constantFrom('system', 'on', 'off'),
      textSize: fc.constantFrom(100, 115, 130),
      updatedAt: opt(time),
    }),
  })
  .map((r) =>
    progressV1.parse({
      schemaVersion: 1,
      ...strip(r),
      threshold: strip(r.threshold),
      lessons: Object.fromEntries(Object.entries(r.lessons).map(([k, v]) => [k, strip(v)])),
      checks: Object.fromEntries(Object.entries(r.checks).map(([k, v]) => [k, strip(v)])),
      challenges: Object.fromEntries(Object.entries(r.challenges).map(([k, v]) => [k, strip(v)])),
      scenarios: Object.fromEntries(Object.entries(r.scenarios).map(([k, v]) => [k, strip(v)])),
      settings: strip(r.settings),
    }),
  )

/** A learner who has finished everything: the biggest record a code has to carry. */
function fullJourney(): Progress {
  const regions = [
    'console-room',
    'harbor',
    'helm-keep',
    'chartroom',
    'mirror-lake',
    'signalwood',
    'stormwatch',
  ]
  const topics = [
    'what-changed',
    'from-watching-to-being-told',
    'your-field-guide',
    'containers-and-images',
    'tags-and-registries',
    'cluster-anatomy',
    'pods-and-namespaces',
    'deployments-and-replicasets',
    'services-and-dns',
    'config-and-secrets',
    'probes-and-resources',
    'kubectl-essentials',
    'contexts-and-safe-habits',
    'output-formats-and-selectors',
    'the-triage-flow',
    'crashloopbackoff',
    'imagepullbackoff',
    'oomkilled',
    'pending-pods',
    'no-endpoints',
    'commit-to-image',
    'reading-a-pipeline',
    'argo-cd-applications',
    'sync-and-health',
    'drift-and-rollback',
    'red-and-use',
    'dashboards',
    'first-promql',
    'spans-and-context',
    'the-collector',
    'logs-to-traces',
    'alerts-and-slos',
    'the-first-five-minutes',
    'act-one',
    'act-two',
    'act-three',
    'act-four',
    'debrief',
    'after-action-review',
    'what-next',
  ]
  let t = Date.parse('2026-11-01T09:00:00.000Z')
  const at = () => new Date((t += 37 * 60_000 + 13_000)).toISOString()
  const p = emptyProgress('2026-11-01T09:00:00.000Z')
  p.displayName = 'Sam Watchstander'
  p.threshold = {
    answers: Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        `q${String(i + 1).padStart(2, '0')}-${regions[i % 7] ?? ''}`,
        i % 3 ? 'b' : 'unsure',
      ]),
    ),
    completedAt: at(),
    placement: {
      foundations: 'navigator',
      containers: 'deckhand',
      kubernetes: 'deckhand',
      delivery: 'wayfarer',
      observability: 'wayfarer',
    },
    overrides: { kubernetes: 'wayfarer' },
    startRegion: 'harbor',
  }
  for (const topic of topics) {
    const steps = ['intro', 'look', 'try-it', 'check', 'wrap-up']
    p.lessons[topic] = {
      currentStep: 4,
      completedSteps: steps,
      completedAt: at(),
      depth: 'operator',
    }
    for (let i = 1; i <= 3; i++)
      p.checks[`${topic}-q${String(i)}`] = {
        attempts: 1 + (i % 2),
        passed: true,
        lastAnswer: i === 2 ? ['a', 'c'] : 'b',
      }
    p.challenges[`${topic}-challenge`] = {
      status: 'completed',
      hintsUsed: topic.length % 3,
      commandsRun: 4 + (topic.length % 9),
      completedAt: at(),
    }
  }
  p.scenarios = {
    ravenpost: {
      act: 4,
      notes: 'Notifier crash-looped on a missing SMTP_HOST key; fixed through Git.',
    },
  }
  p.settings = { reduceMotion: 'on', highContrast: 'system', textSize: 115, updatedAt: at() }
  p.updatedAt = at()
  return progressV1.parse(p)
}

describe('progress code', () => {
  acTest(
    'E3-03.AC1',
    'decode(encode(p)) deep-equals p for 1,000 generated states',
    async () => {
      await fc.assert(
        fc.asyncProperty(progressArb, async (p) => {
          const code = await encodeProgress(p)
          expect(code.startsWith(CODE_PREFIX)).toBe(true)
          const back = await decodeProgress(code, NOW)
          expect(back).toEqual({ ok: true, progress: p })
        }),
        { numRuns: 1000, seed: 42 },
      )
    },
    60_000,
  )

  acTest(
    'E3-03.AC1',
    'the uncompressed fallback round-trips too',
    async () => {
      await fc.assert(
        fc.asyncProperty(progressArb, async (p) => {
          const code = await encodeProgress(p, { compress: false })
          expect(code.startsWith(`${CODE_PREFIX}j.`)).toBe(true)
          expect(await decodeProgress(code, NOW)).toEqual({ ok: true, progress: p })
        }),
        { numRuns: 200, seed: 7 },
      )
    },
    60_000,
  )

  acTest('E3-03.AC2', 'a full-journey progress state encodes to at most 4 KB', async () => {
    const p = fullJourney()
    expect(Object.keys(p.lessons).length).toBe(40)
    const code = await encodeProgress(p)
    expect(code.length).toBeLessThanOrEqual(4096)
    expect(await decodeProgress(code, NOW)).toEqual({ ok: true, progress: p })
  })

  acTest(
    'E3-03.AC3',
    'tampered or truncated codes are rejected with a human-readable message',
    async () => {
      const code = await encodeProgress(fullJourney())
      const swap = (s: string, i: number) =>
        s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1)
      for (const bad of [
        code.slice(0, -1),
        code.slice(0, Math.floor(code.length / 2)),
        code.slice(0, code.lastIndexOf('.')),
        swap(code, 20),
        swap(code, code.length - 3),
        code.replace('BTG1.z.', 'BTG1.j.'),
        `${code}x`,
        'BTG1.',
        'BTG1.z.!!!.00000000',
      ]) {
        expect(await decodeProgress(bad, NOW), bad.slice(0, 40)).toEqual({
          ok: false,
          error: CODE_ERRORS.checksum,
        })
      }
      for (const bad of ['', 'hello', 'btg1.z.abc.00000000', '{"some":"json"}']) {
        expect(await decodeProgress(bad, NOW)).toEqual({ ok: false, error: CODE_ERRORS.notACode })
      }
      // A checksum that matches a payload that isn't valid: forged, or written by a broken encoder.
      const forge = (body: string) =>
        `${CODE_PREFIX}${body}.${crc32(utf8.encode(body)).toString(16).padStart(8, '0')}`
      expect(await decodeProgress(forge('z.AAAA'), NOW)).toEqual({
        ok: false,
        error: CODE_ERRORS.damaged,
      })
      expect(
        await decodeProgress(forge(`j.${toBase64Url(new Uint8Array([0xff, 0xfe]))}`), NOW),
      ).toEqual({ ok: false, error: CODE_ERRORS.damaged })
      expect(await decodeProgress(forge(`j.${toBase64Url(utf8.encode('not json'))}`), NOW)).toEqual(
        { ok: false, error: CODE_ERRORS.unreadable },
      )
      expect(
        await decodeProgress(forge(`j.${toBase64Url(utf8.encode('{"schemaVersion":1}'))}`), NOW),
      ).toEqual({ ok: false, error: CODE_ERRORS.unreadable })
      expect(
        await decodeProgress(forge(`j.${toBase64Url(utf8.encode('{"schemaVersion":7}'))}`), NOW),
      ).toEqual({ ok: false, error: CODE_ERRORS.newer })
      for (const message of Object.values(CODE_ERRORS)) {
        expect(message).toMatch(/^[A-Z].*\.$/)
        expect(message).not.toMatch(/\b(simply|just|obviously|easy|trivial)\b/i)
      }
    },
  )

  it('ignores whitespace a chat or email adds', async () => {
    const p = emptyProgress(NOW)
    const code = await encodeProgress(p)
    const wrapped = `  ${code.slice(0, 10)}\n${code.slice(10, 20)} \r\n${code.slice(20)}\n`
    expect(await decodeProgress(wrapped, NOW)).toEqual({ ok: true, progress: p })
  })

  it('leaves scenario snapshots out of codes and files', async () => {
    const p = {
      ...emptyProgress(NOW),
      scenarios: { ravenpost: { snapshot: { big: 'x'.repeat(10_000) }, act: 2 } },
    }
    expect(exportable(p).scenarios).toEqual({ ravenpost: { act: 2 } })
    expect(p.scenarios.ravenpost.snapshot).toBeDefined()
    const back = await decodeProgress(await encodeProgress(p), NOW)
    expect(back.ok && back.progress.scenarios).toEqual({ ravenpost: { act: 2 } })
    expect(exportFile(p)).not.toContain('xxxx')
  })

  it('says when this browser cannot unpack a compressed code', async () => {
    const code = await encodeProgress(emptyProgress(NOW))
    const original = globalThis.DecompressionStream
    Reflect.deleteProperty(globalThis, 'DecompressionStream')
    try {
      expect(await decodeProgress(code, NOW)).toEqual({
        ok: false,
        error: CODE_ERRORS.noDecompression,
      })
    } finally {
      globalThis.DecompressionStream = original
    }
  })
})

describe('progress files and import', () => {
  it('names the download by date', () => {
    expect(exportFileName(NOW)).toBe('beyond-the-glass-progress-2026-11-24.json')
  })

  it('imports a downloaded file, a bare record, or a pasted code', async () => {
    const p = fullJourney()
    expect(await importText(exportFile(p), NOW)).toEqual({ ok: true, progress: p })
    expect(await importText(JSON.stringify(p), NOW)).toEqual({ ok: true, progress: p })
    expect(await importText(`\n${await encodeProgress(p)}\n`, NOW)).toEqual({
      ok: true,
      progress: p,
    })
    expect(await importText('{broken', NOW)).toEqual({ ok: false, error: CODE_ERRORS.unreadable })
    expect(parseProgressJson('[1,2]', NOW)).toEqual({ ok: false, error: CODE_ERRORS.unreadable })
  })

  it('base64url and CRC-32 behave like their standards', () => {
    expect(crc32(utf8.encode('123456789'))).toBe(0xcbf43926)
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i)
    const text = toBase64Url(bytes)
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(fromBase64Url(text)).toEqual(bytes)
    expect(() => fromBase64Url('a+b/')).toThrow(SyntaxError)
  })
})
