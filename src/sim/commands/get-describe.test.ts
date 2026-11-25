import ravenpost from '@/scenarios/ravenpost.yaml'
import { parse as parseYaml } from 'yaml'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { loadSimulation } from '../controllers'
import { createShell } from './index'
import { PRINTERS } from './printers'

/** Ravenpost at scenario start: deterministic, so every output can be a golden file. */
const shell = () => createShell(loadSimulation(ravenpost))
const nsFlag = (namespaced: boolean, type: string) =>
  type === 'events' ? '-A' : namespaced ? '-n ravenpost' : ''
const FORMATS = [
  ['table', ''],
  ['wide', '-o wide'],
  ['name', '-o name'],
  ['yaml', '-o yaml'],
  ['json', '-o json'],
  ['labels', '--show-labels'],
] as const
const golden = (name: string) => `./__golden__/${name}.txt`
const text = (o: { stdout: string; stderr: string }) =>
  `${o.stdout}${o.stderr ? `\n--- stderr ---\n${o.stderr}` : ''}\n`

describe('E6-05 kubectl get: golden files', () => {
  for (const p of PRINTERS) {
    for (const [fmt, flag] of FORMATS) {
      acTest('E6-05.AC1', `get ${p.type} ${fmt}`, async () => {
        const cmd = `kubectl get ${p.type} ${nsFlag(p.namespaced, p.type)} ${flag}`
          .replace(/\s+/g, ' ')
          .trim()
        const out = shell().run(cmd)
        expect(out.exitCode, cmd).toBe(0)
        await expect(`$ ${cmd}\n${text(out)}`).toMatchFileSnapshot(golden(`get-${p.type}-${fmt}`))
      })
    }
  }

  for (const [name, cmd] of [
    ['selector-equality', 'kubectl get pods -n ravenpost -l app=ravenpost-api'],
    ['selector-set', "kubectl get pods -A -l 'k8s-app in (kube-dns, kube-proxy)'"],
    ['selector-not', 'kubectl get pods -n ravenpost -l app!=ravenpost-api,app!=ravenpost-web'],
    ['events-sorted', 'kubectl get events -n ravenpost --sort-by=.lastTimestamp'],
    ['several-types', 'kubectl get deploy,svc -n ravenpost'],
    ['all', 'kubectl get all -n ravenpost'],
    ['one-yaml', 'kubectl get deployment ravenpost-notifier -n ravenpost -o yaml'],
    ['slash-name', 'kubectl get svc/ravenpost-web -n ravenpost'],
  ] as const) {
    acTest('E6-05.AC1', `get ${name}`, async () => {
      await expect(`$ ${cmd}\n${text(shell().run(cmd))}`).toMatchFileSnapshot(golden(`get-${name}`))
    })
  }
})

describe('E6-05 kubectl describe: golden files', () => {
  for (const [name, cmd] of [
    ['pod-crashloop', 'kubectl describe pod ravenpost-notifier -n ravenpost'],
    ['pod-healthy', 'kubectl describe pods -n ravenpost -l app=ravenpost-web'],
    ['deployment', 'kubectl describe deployment ravenpost-api -n ravenpost'],
    ['service', 'kubectl describe svc ravenpost-web -n ravenpost'],
    ['service-no-endpoints', 'kubectl describe svc ravenpost-notifier -n ravenpost'],
    ['node', 'kubectl describe node ravenpost-worker'],
  ] as const) {
    acTest('E6-05.AC1', `describe ${name}`, async () => {
      const out = shell().run(cmd)
      expect(out.exitCode, cmd).toBe(0)
      await expect(`$ ${cmd}\n${text(out)}`).toMatchFileSnapshot(golden(`describe-${name}`))
    })
  }

  it('describe shows the crash loop the learner is meant to find', () => {
    const out = shell().run('kubectl describe pod ravenpost-notifier -n ravenpost').stdout
    expect(out).toMatch(/^ {4}State: +Waiting\n {6}Reason: +CrashLoopBackOff$/m)
    expect(out).toMatch(/^ {4}Last State: +Terminated\n {6}Reason: +Error\n {6}Exit Code: +1$/m)
    expect(out).toMatch(/^ {4}Restart Count: +9$/m)
    expect(out).toMatch(
      /^ {2}Warning +BackOff +\S+ \(x36 over \S+\) +kubelet +Back-off restarting failed container notifier in pod /m,
    )
  })

  it('describe reports what it can’t find and what it doesn’t describe', () => {
    const sh = shell()
    expect(sh.run('kubectl describe pod nope -n ravenpost')).toMatchObject({
      exitCode: 1,
      stderr: 'Error from server (NotFound): pods "nope" not found',
    })
    expect(sh.run('kubectl describe deploy nope -n ravenpost').stderr).toBe(
      'Error from server (NotFound): deployments.apps "nope" not found',
    )
    expect(sh.run('kubectl describe cm ravenpost-config -n ravenpost').stderr).toMatch(
      /simulator describes pods, deployments, services, nodes/,
    )
    expect(sh.run('kubectl describe pdos x').stderr).toMatch(/Did you mean `pods`\?/)
    expect(sh.run('kubectl describe').exitCode).toBe(1)
    expect(sh.run('kubectl describe pods -n nowhere')).toMatchObject({
      exitCode: 0,
      stderr: 'No resources found in nowhere namespace.',
    })
    // Prefix matching, as kubectl does.
    expect(
      sh.run('kubectl describe pods ravenpost-api -n ravenpost').stdout.match(/^Name:/gm),
    ).toHaveLength(3)
    expect(sh.complete('kubectl describe d').candidates).toEqual(['deployments'])
    expect(sh.complete('kubectl describe node ravenpost-w').candidates).toEqual([
      'ravenpost-worker',
      'ravenpost-worker2',
    ])
  })
})

describe('E6-05 table layout', () => {
  acTest('E6-05.AC2', 'every table aligns its columns the way kubectl’s tabwriter does', () => {
    const sh = shell()
    for (const p of PRINTERS) {
      for (const flag of ['', '-o wide', '--show-labels']) {
        const out = sh.run(`kubectl get ${p.type} ${nsFlag(p.namespaced, p.type)} ${flag}`).stdout
        const [header = '', ...rows] = out.split('\n')
        // Column starts: a capital letter after 3+ spaces (or the line start).
        const starts = [
          0,
          ...[...header.matchAll(/ {3,}(?=\S)/g)].map((m) => m.index + m[0].length),
        ]
        // Each column is at least 6 wide (kubectl's minwidth, confirmed by the E6-11 kind fixtures) and 3 wider than its widest cell.
        for (let i = 1; i < starts.length; i++) {
          const width = (starts[i] ?? 0) - (starts[i - 1] ?? 0)
          expect(width, `${p.type} ${flag} column ${String(i)}`).toBeGreaterThanOrEqual(6)
          const widest = Math.max(
            ...[header, ...rows].map((r) => r.slice(starts[i - 1], starts[i]).trimEnd().length),
          )
          expect(width, `${p.type} ${flag} column ${String(i)}`).toBe(Math.max(widest + 3, 6))
        }
        for (const row of rows)
          for (const s of starts.slice(1))
            expect(row.charAt(s - 1), `${p.type} ${flag}: ${row}`).toBe(' ')
      }
    }
  })
})

describe('E6-05 YAML and JSON', () => {
  acTest(
    'E6-05.AC3',
    '-o yaml is valid YAML that round-trips to the same object as -o json',
    () => {
      const sh = shell()
      for (const p of PRINTERS) {
        const ns = nsFlag(p.namespaced, p.type)
        const yamlOut = sh.run(`kubectl get ${p.type} ${ns} -o yaml`).stdout
        const jsonOut = sh.run(`kubectl get ${p.type} ${ns} -o json`).stdout
        const fromYaml: unknown = parseYaml(yamlOut)
        expect(fromYaml, p.type).toEqual(JSON.parse(jsonOut))
        expect(fromYaml).toMatchObject({ apiVersion: 'v1', kind: 'List' })
      }
      const first = sh.run('kubectl get pods -n ravenpost -o name').stdout.split('\n')[0] ?? ''
      const one = sh.run(`kubectl get ${first} -n ravenpost -o yaml`).stdout
      expect(parseYaml(one)).toMatchObject({
        apiVersion: 'v1',
        kind: 'Pod',
        status: { phase: 'Running' },
      })
      // kubectl's style: sorted keys, quoted timestamps, sequences not indented, no secret values.
      expect(one.split('\n')[0]).toBe('apiVersion: v1')
      expect(one).toMatch(/^ {2}creationTimestamp: "2026-03-\d\dT\d\d:\d\d:\d\dZ"$/m)
      expect(one).toMatch(/^ {2}containers:\n {2}- \w+:/m)
      expect(sh.run('kubectl get secret ravenpost-db -n ravenpost -o yaml').stdout).toMatch(
        /DB_PASSWORD: "<redacted: 19 bytes>"/,
      )
    },
  )
})

describe('kubectl get -w', () => {
  it('watches for a minute of simulated time, printing rows as they change', () => {
    const sim = loadSimulation(ravenpost)
    const sh = createShell(sim)
    const start = sim.now
    const out = sh.run('kubectl get pods -n ravenpost -w')
    expect(sim.now - start).toBe(60_000)
    const lines = out.stdout.split('\n')
    expect(lines[0]).toMatch(/^NAME/)
    // The notifier restarts during the minute, so new rows for it appear after the table.
    expect(lines.slice(9).some((l) => l.startsWith('ravenpost-notifier'))).toBe(true)
  })
})
