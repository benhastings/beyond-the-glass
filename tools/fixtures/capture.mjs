#!/usr/bin/env node
// Captures kubectl output from a real kind cluster for each fault variant (E6-11), masked, into
// src/sim/__fixtures__/real/. Needs Docker, kind and kubectl. Usage: node tools/fixtures/capture.mjs [--keep]
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mask } from '../../src/sim/__fixtures__/normalize.ts'
import { CAPTURES, IMAGES, VARIANTS } from './variants.mjs'

export const KIND_NODE_IMAGE = 'kindest/node:v1.34.0'
const CLUSTER = 'btg-fixtures'
const OUT = join(import.meta.dirname, '../../src/sim/__fixtures__/real')
const WAIT_S = Number(process.env.FIXTURE_WAIT_S ?? 120)
const ctx = `kind-${CLUSTER}`

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts })
const kubectl = (args, input) => {
  try {
    const out = sh('kubectl', ['--context', ctx, ...args], input ? { input } : {})
    return { out, code: 0 }
  } catch (e) {
    return {
      out: `${e.stdout ?? ''}${e.stderr ? `--- stderr ---\n${e.stderr}` : ''}`,
      code: e.status ?? 1,
    }
  }
}

const existing = sh('kind', ['get', 'clusters']).split('\n')
if (!existing.includes(CLUSTER))
  sh(
    'kind',
    ['create', 'cluster', '--name', CLUSTER, '--image', KIND_NODE_IMAGE, '--wait', '120s'],
    { stdio: 'inherit' },
  )
try {
  // Pull into the node first, so pull times don't decide what state each variant reaches.
  for (const image of IMAGES) {
    sh('docker', ['exec', `${CLUSTER}-control-plane`, 'crictl', 'pull', image])
  }
  for (const [variant, objects] of Object.entries(VARIANTS)) {
    const ns = `fx-${variant}`
    kubectl(['create', 'namespace', ns])
    const r = kubectl(
      ['apply', '-n', ns, '-f', '-'],
      JSON.stringify({ apiVersion: 'v1', kind: 'List', items: objects }),
    )
    if (r.code) throw new Error(`apply ${variant}: ${r.out}`)
  }
  console.log(`waiting ${String(WAIT_S)}s for the variants to settle…`)
  execFileSync('sleep', [String(WAIT_S)])
  rmSync(OUT, { recursive: true, force: true })
  for (const variant of Object.keys(VARIANTS)) {
    const ns = `fx-${variant}`
    const dir = join(OUT, variant)
    mkdirSync(dir, { recursive: true })
    const pod = kubectl([
      'get',
      'pods',
      '-n',
      ns,
      '-o',
      'jsonpath={.items[0].metadata.name}',
    ]).out.trim()
    for (const [name, command] of Object.entries(CAPTURES)) {
      const args = command.replace('{pod}', pod).split(' ')
      const r = kubectl([...args, '-n', ns])
      writeFileSync(
        join(dir, `${name}.txt`),
        mask(
          `$ kubectl ${command.replace('{pod}', '<pod>')} -n ${ns}\n${r.out}`.replaceAll(
            ns,
            '<ns>',
          ),
        ),
      )
    }
  }
  const server = JSON.parse(kubectl(['version', '-o', 'json']).out)
  writeFileSync(
    join(OUT, 'metadata.json'),
    `${JSON.stringify(
      {
        kind: sh('kind', ['version']).trim().split(' ')[1],
        nodeImage: KIND_NODE_IMAGE,
        kubernetes: server.serverVersion?.gitVersion,
        kubectl: server.clientVersion?.gitVersion,
        waitSeconds: WAIT_S,
        variants: Object.keys(VARIANTS),
        captures: Object.keys(CAPTURES),
      },
      null,
      2,
    )}\n`,
  )
  console.log(`captured ${String(Object.keys(VARIANTS).length)} variants into ${OUT}`)
} finally {
  if (!process.argv.includes('--keep'))
    sh('kind', ['delete', 'cluster', '--name', CLUSTER], { stdio: 'inherit' })
}
