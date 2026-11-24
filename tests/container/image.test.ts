import { execFileSync, spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Runs in CI's `container` job against the image it just built (CONTAINER_IMAGE=btg:ci); a neutral
// skip everywhere else. Locally: docker build -t btg:dev . && CONTAINER_IMAGE=btg:dev npx vitest run tests/container
const IMAGE = process.env.CONTAINER_IMAGE ?? ''
const SIZE_LIMIT_MB = 30
/** Pinned so a scan result only changes when we choose to bump it. */
export const TRIVY = 'aquasec/trivy:0.76.2'

const docker = (...args: string[]) => execFileSync('docker', args, { encoding: 'utf8' }).trim()

describe.runIf(IMAGE)('E0-09 container image', () => {
  const name = `btg-test-${String(process.pid)}`
  let base = ''

  beforeAll(async () => {
    // The hardened flags from the issue: read-only root, no capabilities, no privilege escalation.
    docker(
      'run',
      '-d',
      '--name',
      name,
      '-p',
      '127.0.0.1::8080',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,size=16m',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      IMAGE,
    )
    const port = docker('port', name, '8080/tcp').split(':').pop() ?? ''
    base = `http://127.0.0.1:${port}`
    for (let i = 0; i < 50; i++) {
      const ok = await fetch(`${base}/healthz`).then(
        (r) => r.ok,
        () => false,
      )
      if (ok) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`container never became healthy:\n${docker('logs', name)}`)
  }, 30_000)

  afterAll(() => {
    spawnSync('docker', ['rm', '-f', name])
  })

  it('[E0-09.AC1] serves the app at /', async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('<div id="root"></div>')
    const script = /src="(\.\/assets\/[^"]+\.js)"/.exec(html)?.[1] ?? ''
    expect((await fetch(new URL(script, `${base}/`))).status).toBe(200)
  })

  it(`[E0-09.AC2] the compressed image is at most ${String(SIZE_LIMIT_MB)} MB`, () => {
    const r = spawnSync('sh', ['-c', `docker save ${IMAGE} | gzip -6 | wc -c`], {
      encoding: 'utf8',
    })
    const mb = Number(r.stdout.trim()) / 1024 / 1024
    console.log(`compressed image: ${mb.toFixed(1)} MB`)
    expect(mb).toBeGreaterThan(1)
    expect(mb).toBeLessThanOrEqual(SIZE_LIMIT_MB)
  })

  it('[E0-09.AC3] runs as a non-root UID under --read-only --cap-drop=ALL --security-opt=no-new-privileges', () => {
    expect(docker('image', 'inspect', IMAGE, '--format', '{{.Config.User}}')).toBe('101:101')
    const hc = JSON.parse(docker('inspect', name, '--format', '{{json .HostConfig}}')) as {
      ReadonlyRootfs: boolean
      CapDrop: string[]
      SecurityOpt: string[]
    }
    expect(hc.ReadonlyRootfs).toBe(true)
    expect(hc.CapDrop).toEqual(['ALL'])
    expect(hc.SecurityOpt).toContain('no-new-privileges')
    const uids = docker('top', name, '-o', 'pid,uid,comm')
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(/\s+/)[1])
    expect(uids.length).toBeGreaterThan(0)
    expect(
      uids.every((u) => u === '101'),
      `process UIDs: ${uids.join(', ')}`,
    ).toBe(true)
  })

  it('[E0-09.AC4] GET /healthz returns 200', async () => {
    const res = await fetch(`${base}/healthz`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok\n')
  })

  it('[E0-09.AC4] a path-style link redirects to its hash route, keeping the query string', async () => {
    const res = await fetch(`${base}/region/chartroom?from=old`, { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(new URL(res.headers.get('location') ?? '', base).href).toBe(
      `${base}/#/region/chartroom?from=old`,
    )
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404)
  })

  it('caches hashed assets for a year and never caches index.html', async () => {
    const html = await (await fetch(`${base}/`)).text()
    const asset = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1] ?? ''
    expect((await fetch(`${base}/${asset}`)).headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    )
    expect((await fetch(`${base}/`)).headers.get('cache-control')).toBe('no-cache')
  })

  it('[E0-09.AC6] Trivy finds no fixable critical or high vulnerabilities', () => {
    const r = spawnSync(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        '/var/run/docker.sock:/var/run/docker.sock',
        '-v',
        'btg-trivy-cache:/root/.cache',
        TRIVY,
        'image',
        '--quiet',
        '--severity',
        'HIGH,CRITICAL',
        '--ignore-unfixed',
        '--exit-code',
        '1',
        '--format',
        'table',
        IMAGE,
      ],
      { encoding: 'utf8' },
    )
    console.log(r.stdout)
    expect(r.status, r.stdout + r.stderr).toBe(0)
  }, 300_000)
})
