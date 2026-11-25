import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { createShell } from '../commands'
import { describeReasons, describeSections, eventReasons, mask, tableHeader } from './normalize'
import { SIM_VARIANTS, simVariant } from './variants'

const REAL = join(process.cwd(), 'src/sim/__fixtures__/real')
const meta = JSON.parse(readFileSync(join(REAL, 'metadata.json'), 'utf8')) as {
  kind: string
  nodeImage: string
  kubernetes: string
  waitSeconds: number
  variants: string[]
}
/** A captured output without its `$ command` line. */
const real = (v: string, c: string) =>
  readFileSync(join(REAL, v, `${c}.txt`), 'utf8')
    .split('\n')
    .slice(1)
    .join('\n')
/** Events that depend on whether the node already had the image, which differs between runs. */
const CACHE_DEPENDENT = new Set(['Pulling'])
const unique = (xs: string[]) => [...new Set(xs)].filter((x) => !CACHE_DEPENDENT.has(x)).sort()

function sim(variant: string) {
  const s = simVariant(variant, meta.waitSeconds * 1000)
  const sh = createShell(s)
  const newest = s
    .cluster()
    .list('Pod', { namespace: 'shop' })
    .filter((p) => !p.metadata.deletionTimestamp)
    .sort((a, b) => (a.metadata.creationTimestamp < b.metadata.creationTimestamp ? 1 : -1))[0]
  const pod = newest?.metadata.name ?? ''
  const run = (cmd: string) => mask(sh.run(`kubectl ${cmd} -n shop`).stdout)
  return { run, pod, sh }
}

describe('E6-11 real kind fixtures', () => {
  acTest('E6-11.AC3', 'fixture metadata records the pinned kind and Kubernetes versions', () => {
    expect(meta.nodeImage).toMatch(/^kindest\/node:v\d+\.\d+\.\d+$/)
    expect(meta.kubernetes).toBe(meta.nodeImage.split(':')[1])
    expect(meta.kind).toMatch(/^v\d+\.\d+\.\d+$/)
    expect(meta.variants.sort()).toEqual(Object.keys(SIM_VARIANTS).sort())
    for (const v of meta.variants)
      expect(existsSync(join(REAL, v, 'describe-pod.txt')), v).toBe(true)
  })

  for (const variant of Object.keys(SIM_VARIANTS)) {
    acTest(
      'E6-11.AC2',
      `${variant}: the simulator's output has the real structure and reasons`,
      () => {
        const s = sim(variant)
        const simPods = s.run('get pods')
        const simPod = mask(s.sh.run(`kubectl get pods -n shop`).stdout)
          .split('\n')
          .find((l) => l.startsWith(mask(s.pod)))
        // Tables: the same columns.
        for (const [cmd, file] of [
          ['get pods', 'get-pods'],
          ['get pods -o wide', 'get-pods-wide'],
          ['get deploy', 'get-deploy'],
          ['get svc', 'get-svc'],
        ] as const) {
          const r = real(variant, file)
          if (!r.trim() || r.includes('No resources found')) continue
          expect(tableHeader(s.run(cmd)), `${variant} ${cmd}`).toEqual(tableHeader(r))
        }
        expect(simPods).toBeTruthy()
        // The newest pod's READY and STATUS columns match.
        const realRow =
          real(variant, 'get-pods')
            .split('\n')[1]
            ?.trim()
            .split(/\s{2,}/) ?? []
        const simRow = simPod?.trim().split(/\s{2,}/) ?? []
        expect(simRow.slice(1, 3), `${variant} READY/STATUS`).toEqual(realRow.slice(1, 3))
        // describe pod: the same sections in the same order, the same state reasons and event reasons.
        const rd = real(variant, 'describe-pod')
        const sd = mask(s.sh.run(`kubectl describe pod ${s.pod} -n shop`).stdout)
        expect(describeSections(sd), `${variant} describe sections`).toEqual(describeSections(rd))
        expect(describeReasons(sd), `${variant} state reasons`).toEqual(describeReasons(rd))
        expect(unique(eventReasons(sd)), `${variant} event reasons`).toEqual(
          unique(eventReasons(rd)),
        )
        // describe deployment: the same sections.
        expect(
          describeSections(s.run('describe deploy web')),
          `${variant} describe deploy`,
        ).toEqual(describeSections(real(variant, 'describe-deploy')))
      },
    )
  }
})
