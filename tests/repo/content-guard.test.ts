import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
// @ts-expect-error -- plain ESM script without type declarations
import * as guard from '../../scripts/content-guard.mjs'
import { ROOT } from './helpers.ts'

interface Finding {
  path: string
  line: number
  category: string
  detail: string
}
interface Result {
  code: number
  out: string[]
  findings: Finding[]
}
const { run, findIpv4, findHostnames } = guard as {
  run: (root: string, env?: Record<string, string>) => Result
  findIpv4: (line: string) => string[]
  findHostnames: (line: string) => string[]
}

const dirs: string[] = []
/** A scratch git repo with the real denylist and allowlist plus the given files. */
function repo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'btg-guard-'))
  dirs.push(dir)
  execFileSync('git', ['init', '-q'], { cwd: dir })
  const all = {
    'scripts/ip-denylist.txt': readFileSync(join(ROOT, 'scripts/ip-denylist.txt'), 'utf8'),
    'scripts/content-guard-allow.txt': readFileSync(
      join(ROOT, 'scripts/content-guard-allow.txt'),
      'utf8',
    ),
    ...files,
  }
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const SECRET = 'ravenwharf\\.example\nproject[- ]bluegill'

describe('E0-06 content guard', () => {
  describe('[E0-06.AC1] fails on any match and prints file:line and category', () => {
    it('[E0-06.AC1] reports each category with file and line, and exits 1', () => {
      const dir = repo({
        'src/a.ts': 'ok\nconst host = "10.20.30.40"\n',
        'src/b.md': 'Through the wardrobe we go\n',
        'src/c.yaml': 'url: https://api.ops.internal/x\n',
        'src/d.txt': 'line one\nline two\nsee Project Bluegill for details\n',
      })
      const r = run(dir, { CONTENT_DENYLIST: SECRET })
      expect(r.code).toBe(1)
      expect(r.out).toEqual(
        expect.arrayContaining([
          'src/a.ts:2  ipv4  10.20.30.40',
          'src/b.md:1  franchise-ip  wardrobe',
          'src/c.yaml:1  hostname  api.ops.internal',
          'src/d.txt:3  private-denylist',
        ]),
      )
    })

    it('[E0-06.AC1] never prints a private pattern or the text it matched', () => {
      const dir = repo({ 'notes.md': 'ping ravenwharf.example now\n' })
      const r = run(dir, { CONTENT_DENYLIST: SECRET })
      const log = r.out.join('\n')
      expect(r.code).toBe(1)
      expect(log).toContain('notes.md:1  private-denylist')
      expect(log.toLowerCase()).not.toContain('ravenwharf')
      expect(log.toLowerCase()).not.toContain('bluegill')
    })

    it('[E0-06.AC1] warns instead of failing when the secret is absent', () => {
      const dir = repo({ 'notes.md': 'ping ravenwharf.example now\n' })
      const r = run(dir, {})
      expect(r.code).toBe(0)
      expect(r.out[0]).toMatch(/^::warning::CONTENT_DENYLIST is not set/)
    })

    it('[E0-06.AC1] CI runs it as the required content-guard job with the secret', () => {
      const ci = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
        jobs: Record<
          string,
          {
            name?: string
            env?: Record<string, string>
            steps: { run?: string; env?: Record<string, string> }[]
          }
        >
      }
      const job = Object.values(ci.jobs).find((j) => j.name === 'content-guard')
      expect(job).toBeDefined()
      const step = job?.steps.find((s) => s.run?.includes('scripts/content-guard.mjs'))
      expect(step?.env?.CONTENT_DENYLIST ?? job?.env?.CONTENT_DENYLIST).toBe(
        '${{ secrets.CONTENT_DENYLIST }}',
      )
      expect(readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8')).toMatch(
        /^ {2}- `content-guard`$/m,
      )
    })

    it('[E0-06.AC1] the repository itself is clean', () => {
      const r = run(ROOT, {})
      expect(r.findings).toEqual([])
    })
  })

  describe('[E0-06.AC2] addresses and hostnames', () => {
    it.each([
      '8.8.8.8',
      '172.16.4.2',
      '192.168.1.10',
      '10.0.0.1',
      '10.243.255.255',
      '10.245.0.1',
      '10.95.255.255',
      '10.112.0.0',
      '192.0.3.1',
      '203.0.114.9',
    ])('[E0-06.AC2] flags %s', (ip) => {
      expect(findIpv4(`addr ${ip} here`)).toEqual([ip])
    })

    it.each([
      ['10.244.0.0', 'pod CIDR start'],
      ['10.244.255.255', 'pod CIDR end'],
      ['10.96.0.1', 'service CIDR start'],
      ['10.111.255.254', 'service CIDR end'],
      ['192.0.2.10', 'TEST-NET-1'],
      ['198.51.100.7', 'TEST-NET-2'],
      ['203.0.113.255', 'TEST-NET-3'],
      ['127.0.0.1', 'loopback'],
      ['0.0.0.0', 'unspecified'],
    ])('[E0-06.AC2] allows %s (%s)', (ip) => {
      expect(findIpv4(`addr ${ip} here`)).toEqual([])
    })

    it('[E0-06.AC2] ignores version strings that are not addresses', () => {
      expect(findIpv4('clickhouse 26.9.27.300 and node 26.8.1 and 1.2.3.4.5')).toEqual([])
    })

    it.each([
      'ops.example.mil',
      'portal.agency.gov',
      'gateway.gov.uk',
      'db.ops.internal',
      'build.acme.corp',
    ])('[E0-06.AC2] flags hostname %s', (h) => {
      expect(findHostnames(`see https://${h}/path`)).toEqual([h])
    })

    it('[E0-06.AC2] allows fictional example hostnames', () => {
      expect(
        findHostnames('api.ravenpost.example and grafana.example.com and svc.cluster.local'),
      ).toEqual([])
    })
  })

  describe('[E0-06.AC3] guardrail documents', () => {
    const text = 'Never use Narnia, a wardrobe or a lamp-post.\n'

    it('[E0-06.AC3] may name franchise IP in AGENTS.md, docs/plan and the denylist itself', () => {
      const dir = repo({
        'AGENTS.md': text,
        'docs/plan/ROADMAP.md': text,
        'docs/plan/epics/E0.md': text,
      })
      expect(run(dir, {}).findings).toEqual([])
    })

    it('[E0-06.AC3] the same words anywhere else are flagged', () => {
      const dir = repo({ 'src/app/lesson.mdx': text, 'docs/other.md': text })
      const cats = run(dir, {}).findings.map(
        (f) => `${f.path} ${f.category} ${f.detail.toLowerCase()}`,
      )
      expect(cats).toEqual(
        expect.arrayContaining([
          'src/app/lesson.mdx franchise-ip narnia',
          'src/app/lesson.mdx franchise-ip wardrobe',
          'src/app/lesson.mdx franchise-ip lamp-post',
          'docs/other.md franchise-ip narnia',
        ]),
      )
    })

    it('[E0-06.AC3] the private denylist still applies to guardrail documents', () => {
      const dir = repo({
        'AGENTS.md': 'Example: ravenwharf.example\n',
        'docs/plan/x.md': 'project bluegill\n',
      })
      const r = run(dir, { CONTENT_DENYLIST: SECRET })
      expect(r.findings.map((f) => `${f.path} ${f.category}`).sort()).toEqual([
        'AGENTS.md private-denylist',
        'docs/plan/x.md private-denylist',
      ])
    })

    it('[E0-06.AC3] the allowlist can only except franchise-ip, ipv4 and hostname', () => {
      const dir = repo({
        'scripts/content-guard-allow.txt': 'notes.md private-denylist\n',
        'notes.md': 'hello\n',
      })
      expect(() => run(dir, { CONTENT_DENYLIST: SECRET })).toThrow(/no valid category/)
    })
  })

  it('[E0-06.AC4] CONTRIBUTING.md explains the secret and how to request an exception', () => {
    const doc = readFileSync(join(ROOT, 'CONTRIBUTING.md'), 'utf8')
    const section = /^## Content guard\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(doc)?.[1] ?? ''
    expect(section).toMatch(/gh secret set CONTENT_DENYLIST/)
    expect(section).toMatch(/scripts\/content-guard-allow\.txt/)
    expect(section).toMatch(/exception/i)
  })
})
