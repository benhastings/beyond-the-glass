import { execFileSync } from 'node:child_process'
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Copies what a clean clone would contain (tracked files plus new files that aren't
 * gitignored) into a fresh temp directory. node_modules, dist and other ignored files are left behind.
 */
export function cleanCheckout(): string {
  const dir = mkdtempSync(join(tmpdir(), 'btg-clean-'))
  const files = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean)
  for (const f of files) cpSync(join(ROOT, f), join(dir, f), { recursive: true })
  return dir
}

export function run(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, CI: '1' },
  })
}

/**
 * A throwaway epic for tracer fixtures, so they never borrow a real criterion that may gain real tests
 * later. Write it into a scratch checkout's docs/plan/epics/. Criteria: E99-01.AC1 to AC4 (automated)
 * and E99-01.AC5 (manual).
 */
export const FIXTURE_EPIC = `# E99 · Fixture epic for tracer tests
<!-- epic: milestone=M0; labels=area:infra -->

**Epic success criteria**
- [ ] \`SC1\` Fixture holds

---

## E99-01 · Fixture issue
<!-- meta: milestone=M0; size=S; labels=type:chore; depends= -->

**Acceptance criteria**
- [ ] \`AC1\` First automated criterion
- [ ] \`AC2\` Second automated criterion
- [ ] \`AC3\` Third automated criterion
- [ ] \`AC4\` Fourth automated criterion
- [ ] \`AC5\` \`manual\` A human signs off
`
