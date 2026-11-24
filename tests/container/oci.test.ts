import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { ROOT } from '../repo/helpers.ts'

// The release build, made without pushing: CI's `container` job runs
//   docker buildx build --platform linux/amd64,linux/arm64 --sbom=true --provenance=mode=max \
//     --output type=oci,dest=btg-oci.tar .
// and points OCI_ARCHIVE at the result. A neutral skip everywhere else.
const ARCHIVE = process.env.OCI_ARCHIVE ?? ''

interface Descriptor {
  mediaType: string
  digest: string
  platform?: { os: string; architecture: string }
  annotations?: Record<string, string>
}

describe.runIf(ARCHIVE)('E0-09 multi-arch release image', () => {
  let dir = ''
  const blob = (digest: string): unknown =>
    JSON.parse(readFileSync(join(dir, 'blobs', ...digest.split(':')), 'utf8'))

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'btg-oci-'))
    execFileSync('tar', ['-xf', ARCHIVE, '-C', dir])
  })
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('[E0-09.AC8] builds linux/amd64 and linux/arm64 with an SBOM and provenance attestation for each', () => {
    const top = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as {
      manifests: Descriptor[]
    }
    const index = blob(top.manifests[0]?.digest ?? '') as { manifests: Descriptor[] }
    expect(index.manifests, 'a multi-platform image index').toBeInstanceOf(Array)
    const images = index.manifests.filter((m) => m.platform?.os === 'linux')
    expect(
      images.map((m) => `${m.platform?.os ?? ''}/${m.platform?.architecture ?? ''}`).sort(),
    ).toEqual(['linux/amd64', 'linux/arm64'])
    for (const image of images) {
      const att = index.manifests.find(
        (m) =>
          m.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest' &&
          m.annotations['vnd.docker.reference.digest'] === image.digest,
      )
      expect(att, `attestation for ${image.platform?.architecture ?? ''}`).toBeDefined()
      const layers = (blob(att?.digest ?? '') as { layers: Descriptor[] }).layers
      const predicates = layers.map((l) => l.annotations?.['in-toto.io/predicate-type'] ?? '')
      expect(predicates).toContain('https://spdx.dev/Document')
      expect(predicates.some((p) => p.startsWith('https://slsa.dev/provenance/'))).toBe(true)
    }
  })

  it('[E0-09.AC8] tagged releases push that build to GHCR', () => {
    const wf = parse(readFileSync(join(ROOT, '.github/workflows/release.yml'), 'utf8')) as {
      on: { push: { tags: string[] } }
      permissions: Record<string, string>
      jobs: Record<string, { steps: { uses?: string; with?: Record<string, unknown> }[] }>
    }
    expect(wf.on.push.tags).toEqual(['v*'])
    expect(wf.permissions.packages).toBe('write')
    const build = Object.values(wf.jobs)
      .flatMap((j) => j.steps)
      .find((s) => s.uses?.startsWith('docker/build-push-action'))
    expect(build?.with).toMatchObject({
      platforms: 'linux/amd64,linux/arm64',
      push: true,
      sbom: true,
      provenance: 'mode=max',
    })
    expect(String(build?.with?.tags)).toContain('steps.meta.outputs.tags')
  })
})
