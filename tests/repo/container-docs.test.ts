import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROOT } from './helpers.ts'

describe('E0-09 container documentation', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
  const section =
    /^## Self-hosting with the container image\n([\s\S]*?)(?=^## )/m.exec(readme)?.[1] ?? ''

  it('[E0-09.AC9] README documents run, compose, Kubernetes and air-gapped use', () => {
    expect(section).toMatch(/docker run --rm -p 8080:8080/)
    expect(section).toMatch(/docker compose -f deploy\/compose\.yaml up/)
    expect(section).toMatch(/kubectl apply -k deploy\/k8s/)
    expect(section).toMatch(/docker save [^\n]+\| gzip/)
    expect(section).toMatch(/docker load/)
  })

  it('[E0-09.AC9] the documented hardened run uses the same flags CI tests', () => {
    const ci = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')
    for (const flag of ['--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges']) {
      expect(section, flag).toContain(flag)
      expect(ci, flag).toContain(flag)
    }
  })
})
