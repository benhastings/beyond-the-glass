import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ROOT } from '../repo/helpers.ts'

// Runs in CI's `k8s` job against a kind cluster with the image loaded (K8S_IMAGE=btg:ci).
// Locally: kind create cluster && kind load docker-image btg:dev && K8S_IMAGE=btg:dev npx vitest run tests/container/k8s.test.ts
const IMAGE = process.env.K8S_IMAGE ?? ''
const NS = `btg-${String(process.pid)}`
const kubectl = (...args: string[]) => execFileSync('kubectl', args, { encoding: 'utf8' }).trim()

describe.runIf(IMAGE)('E0-09 Kubernetes manifests', () => {
  const overlay = mkdtempSync(join(tmpdir(), 'btg-k8s-'))
  afterAll(() => {
    spawnSync('kubectl', ['delete', 'namespace', NS, '--wait=false'])
    rmSync(overlay, { recursive: true, force: true })
  })

  it('[E0-09.AC7] kubectl apply -k deploy/k8s yields Ready pods and a Service that serves the app', async () => {
    // An overlay that only swaps the image for the one loaded into kind.
    const [name, tag] = IMAGE.split(':')
    writeFileSync(
      join(overlay, 'kustomization.yaml'),
      [
        'apiVersion: kustomize.config.k8s.io/v1beta1',
        'kind: Kustomization',
        `namespace: ${NS}`,
        'resources:',
        `  - ${join(ROOT, 'deploy/k8s')}`,
        'images:',
        '  - name: ghcr.io/benhastings/beyond-the-glass',
        `    newName: ${name ?? ''}`,
        `    newTag: ${tag ?? 'latest'}`,
        '',
      ].join('\n'),
    )
    kubectl('create', 'namespace', NS)
    // `-k` on the overlay applies deploy/k8s itself, with only the image swapped.
    kubectl('apply', '-k', overlay)
    kubectl('-n', NS, 'rollout', 'status', 'deployment/beyond-the-glass', '--timeout=120s')
    const ready = kubectl(
      '-n',
      NS,
      'get',
      'pods',
      '-o',
      'jsonpath={.items[*].status.conditions[?(@.type=="Ready")].status}',
    )
    expect(ready.split(' ')).toEqual(['True', 'True'])

    const pf = spawn('kubectl', ['-n', NS, 'port-forward', 'service/beyond-the-glass', '18080:80'])
    try {
      await new Promise<void>((resolve, reject) => {
        pf.stdout.on('data', (d: Buffer) => {
          if (d.toString().includes('Forwarding')) resolve()
        })
        pf.on('exit', () => {
          reject(new Error('port-forward exited'))
        })
        setTimeout(() => {
          reject(new Error('port-forward timed out'))
        }, 20_000)
      })
      const html = await (await fetch('http://127.0.0.1:18080/')).text()
      expect(html).toContain('<div id="root"></div>')
      expect((await fetch('http://127.0.0.1:18080/healthz')).status).toBe(200)
    } finally {
      pf.kill()
    }
  }, 240_000)
})
