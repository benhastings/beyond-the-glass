import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import { auditLog, loadSimulation } from '../controllers'
import { scenarioSchema } from '../core/scenario'
import { miniScenarioInput } from '../core/testing'
import { createShell } from './index'
import type { EditRequest } from './types'

const DEPLOY = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
  labels: { app: web }
spec:
  replicas: 3
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      containers:
        - name: web
          image: registry.example/web:1.0
`
const files: Record<string, string> = {
  'web.yaml': DEPLOY,
  'bad-indent.yaml': DEPLOY.replace('  replicas: 3', '  replicas: 3\n    oops: true\n  more'),
  'tabs.yaml': DEPLOY.replace('  replicas: 3', '\treplicas: 3'),
  'typo.yaml': DEPLOY.replace('replicas: 3', 'replica: 3').replace('image:', 'imag:'),
  'wrong-api.yaml': DEPLOY.replace('apps/v1', 'v1'),
  'no-kind.yaml': 'apiVersion: v1\nmetadata: { name: x }\n',
  'no-image.yaml': DEPLOY.replace('          image: registry.example/web:1.0\n', ''),
  'mismatch.yaml': DEPLOY.replace(
    'labels: { app: web }\n    spec:',
    'labels: { app: other }\n    spec:',
  ),
  'volumes.yaml': DEPLOY.replace('      containers:', '      volumes: []\n      containers:'),
  'string-replicas.yaml': DEPLOY.replace('replicas: 3', 'replicas: three'),
  'new/cm.yaml':
    'apiVersion: v1\nkind: ConfigMap\nmetadata: { name: extra }\ndata: { A: "1" }\n---\napiVersion: v1\nkind: Service\nmetadata: { name: extra }\nspec:\n  selector: { app: web }\n  ports: [{ port: 80 }]\n',
  'new/deeper/ns.yaml': 'apiVersion: v1\nkind: Namespace\nmetadata: { name: lab }\n',
  'notes.txt': 'not a manifest',
}

function mini() {
  const sim = loadSimulation(scenarioSchema.parse(miniScenarioInput({ files })))
  sim.advance(30_000)
  const sh = createShell(sim)
  const snapshot = () => JSON.stringify(sim.cluster().list('Deployment'))
  return { sim, sh, snapshot }
}

describe('E6-08 files', () => {
  it('ls, cat, cd and pwd browse the scenario’s files', () => {
    const { sh } = mini()
    expect(sh.run('pwd').stdout).toBe('/home/operator')
    expect(sh.run('ls').stdout).toMatch(/^bad-indent\.yaml {2}.*new\/ {2}.*notes\.txt/)
    expect(sh.run('ls -l new').stdout).toMatch(
      /^-rw-r--r-- operator operator +\d+ cm\.yaml\ndrwxr-xr-x .* deeper\/$/,
    )
    expect(sh.run('ls nope')).toMatchObject({
      stderr: "ls: cannot access 'nope': No such file or directory",
      exitCode: 2,
    })
    expect(sh.run('cat notes.txt').stdout).toBe('not a manifest')
    expect(sh.run('cat new').stderr).toBe('cat: new: Is a directory')
    expect(sh.run('cat nope').stderr).toBe('cat: nope: No such file or directory')
    expect(sh.run('cat').exitCode).toBe(1)
    expect(sh.run('cd new/deeper').exitCode).toBe(0)
    expect(sh.run('pwd').stdout).toBe('/home/operator/new/deeper')
    expect(sh.run('cat ../cm.yaml').stdout).toMatch(/^apiVersion: v1/)
    expect(sh.run('cd ns.yaml').stderr).toBe('cd: ns.yaml: Not a directory')
    expect(sh.run('cd /nowhere').stderr).toBe('cd: /nowhere: No such file or directory')
    sh.run('cd')
    expect(sh.run('pwd').stdout).toBe('/home/operator')
    expect(sh.complete('cat ne').candidates).toEqual(['new/'])
    expect(sh.complete('cd new/d').candidates).toEqual(['new/deeper/'])
    expect(sh.complete('ls w').candidates).toEqual(['web.yaml', 'wrong-api.yaml'])
  })
})

describe('E6-08 kubectl apply', () => {
  it('creates, configures and leaves unchanged, like kubectl', () => {
    const { sim, sh } = mini()
    const first = sh.run('kubectl apply -f web.yaml')
    expect(first.stdout).toBe('deployment.apps/web configured')
    expect(first.stderr).toMatch(
      /^Warning: resource deployments\.apps\/web is missing the kubectl\.kubernetes\.io\/last-applied-configuration annotation/,
    )
    expect(first.exitCode).toBe(0)
    expect(sh.run('kubectl apply -f web.yaml')).toEqual({
      stdout: 'deployment.apps/web unchanged',
      stderr: '',
      exitCode: 0,
    })
    sim.advance(30_000)
    expect(sh.run('kubectl get deploy web').stdout).toMatch(/^web +3\/3 /m)
    expect(sh.run('kubectl apply -f new -R').stdout).toBe(
      'configmap/extra created\nservice/extra created\nnamespace/lab created',
    )
    expect(sh.run('kubectl get svc extra').stdout).toMatch(
      /^extra +ClusterIP +10\.96\.\d+\.\d+ +<none> +80\/TCP/m,
    )
    expect(sh.run('kubectl apply -f new/cm.yaml --dry-run=server').stdout).toBe(
      'configmap/extra unchanged (server dry run)\nservice/extra unchanged (server dry run)',
    )
    expect(
      auditLog(sim).map((e) => `${e.verb} ${e.kind}/${e.name} ${String(e.detail?.action)}`),
    ).toEqual([
      'apply Deployment/web configured',
      'apply ConfigMap/extra created',
      'apply Service/extra created',
      'apply Namespace/lab created',
    ])
  })

  acTest('E6-08.AC2', 'malformed YAML is reported with its line number and changes nothing', () => {
    const { sh, snapshot } = mini()
    const before = snapshot()
    const indent = sh.run('kubectl apply -f bad-indent.yaml')
    expect(indent.exitCode).toBe(1)
    expect(indent.stderr).toMatch(
      /^error: error parsing bad-indent\.yaml: error converting YAML to JSON: yaml: line (8|9|10): /,
    )
    expect(sh.run('kubectl apply -f tabs.yaml').stderr).toMatch(
      /yaml: line 8: found character that cannot start any token$/,
    )
    expect(sh.run('kubectl diff -f tabs.yaml').stderr).toMatch(/yaml: line 8:/)
    expect(snapshot()).toBe(before)
    // Edit: the editor opens again, with the error (and the line as the editor numbers it) at the top.
    const edit = sh.run('kubectl edit deploy web').edit as EditRequest
    const broken = edit.text.replace('  replicas: 2', '  replicas: 2\n    oops: true\n  more')
    const step = edit.save(broken)
    if (!('reopen' in step)) throw new Error('expected the editor to reopen')
    expect(step.error).toMatch(/^error converting YAML to JSON: yaml: line \d+: /)
    expect(step.line).toBeGreaterThan(4)
    const reopenedLine = step.reopen.split('\n')[(step.line ?? 1) - 1] ?? ''
    expect(reopenedLine.trim()).toMatch(/oops: true|more|replicas: 2/)
    expect(step.reopen).toMatch(/^# Please edit the object below\./)
    expect(step.reopen).toMatch(
      new RegExp(`^# The edited file had a syntax error: .*line ${String(step.line)}:`, 'm'),
    )
    expect(snapshot()).toBe(before)
    expect(auditLog(mini().sim)).toEqual([])
  })

  it('reports common mistakes in kubectl’s words, and changes nothing', () => {
    const { sh, snapshot } = mini()
    const before = snapshot()
    const err = (f: string) => sh.run(`kubectl apply -f ${f}`).stderr
    expect(err('typo.yaml')).toBe(
      'Error from server (BadRequest): error when patching "typo.yaml": Deployment in version "v1" cannot be handled as a Deployment: strict decoding error: unknown field "spec.template.spec.containers[0].imag", unknown field "spec.replica"',
    )
    expect(err('wrong-api.yaml')).toBe(
      'error: resource mapping not found for name: "web" namespace: "shop" from "wrong-api.yaml": no matches for kind "Deployment" in version "v1"\nensure CRDs are installed first',
    )
    expect(err('no-kind.yaml')).toMatch(/error validating data: \[kind not set\]/)
    expect(err('no-image.yaml')).toBe(
      'The Deployment "web" is invalid: spec.template.spec.containers[0].image: Required value',
    )
    expect(err('mismatch.yaml')).toMatch(
      /^The Deployment "web" is invalid: spec\.template\.metadata\.labels: Invalid value: map\[string\]string\{"app":"other"\}: `selector` does not match template `labels`/,
    )
    expect(err('volumes.yaml')).toMatch(
      /spec\.template\.spec\.volumes .* is a real field, but this simulator doesn't model it yet/,
    )
    expect(err('string-replicas.yaml')).toMatch(
      /cannot unmarshal string into Go struct field \.spec\.replicas of type int32/,
    )
    expect(err('notes.txt')).toMatch(/error validating data: invalid object/)
    expect(err('nope.yaml')).toBe('error: the path "nope.yaml" does not exist')
    expect(sh.run('kubectl apply').stderr).toBe('error: must specify one of -f and -k')
    expect(sh.run('kubectl apply -f web.yaml -n other').stderr).toMatch(
      /does not match the namespace "other"/,
    )
    expect(sh.run('kubectl apply -f web.yaml --dry-run=maybe').exitCode).toBe(1)
    expect(sh.run('kubectl apply -f https://example.com/x.yaml').stderr).toMatch(/can't fetch/)
    expect(snapshot()).toBe(before)
  })
})

describe('E6-08 kubectl diff', () => {
  acTest(
    'E6-08.AC3',
    'diff prints a unified diff with kubectl’s headers, and exits 1 when there are differences',
    () => {
      const { sim, sh } = mini()
      sh.run('kubectl apply -f web.yaml')
      sim.advance(30_000)
      expect(sh.run('kubectl diff -f web.yaml')).toEqual({ stdout: '', stderr: '', exitCode: 0 })
      sh.run('kubectl scale deploy web --replicas=5')
      const out = sh.run('kubectl diff -f web.yaml')
      expect(out.exitCode).toBe(1)
      const lines = out.stdout.split('\n')
      expect(lines[0]).toMatch(
        /^diff -u -N \/tmp\/LIVE-\d+\/apps\.v1\.Deployment\.shop\.web \/tmp\/MERGED-\d+\/apps\.v1\.Deployment\.shop\.web$/,
      )
      expect(lines[1]).toMatch(
        /^--- \/tmp\/LIVE-\d+\/apps\.v1\.Deployment\.shop\.web\t2026-\d\d-\d\d \d\d:\d\d:\d\d\.000000000 \+0000$/,
      )
      expect(lines[2]).toMatch(/^\+\+\+ \/tmp\/MERGED-\d+\/apps\.v1\.Deployment\.shop\.web\t/)
      expect(lines[3]).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/)
      expect(lines).toContain('-  replicas: 5')
      expect(lines).toContain('+  replicas: 3')
      expect(lines.indexOf('-  replicas: 5')).toBeLessThan(lines.indexOf('+  replicas: 3'))
      for (const l of lines.slice(3))
        expect(l).toMatch(/^(@@ -\d+(,\d+)? \+\d+(,\d+)? @@| .*|-.*|\+.*)$/)
      // A new object: every line added, from an empty file.
      const created = sh.run('kubectl diff -f new/cm.yaml').stdout
      expect(created).toMatch(/^@@ -0,0 \+1,\d+ @@$/m)
      expect(created).toMatch(/^\+kind: ConfigMap$/m)
      expect(created).toMatch(/v1\.ConfigMap\.shop\.extra/)
      // Diff changes nothing.
      expect(sim.cluster().get('ConfigMap', 'shop', 'extra')).toBeUndefined()
      expect(sh.run('kubectl diff -f typo.yaml').exitCode).toBe(1)
      expect(sh.run('kubectl diff').stderr).toBe('error: must specify one of -f and -k')
    },
  )
})

describe('E6-08 kubectl edit', () => {
  it('opens the object, saves valid changes, reopens invalid ones, and cancels cleanly', () => {
    const { sim, sh, snapshot } = mini()
    const out = sh.run('kubectl edit deployment/web')
    const e = out.edit as EditRequest
    expect(e.title).toBe('deployment.apps/web')
    expect(e.fileName).toMatch(/^\/tmp\/kubectl-edit-\d{10}\.yaml$/)
    expect(e.text).toMatch(
      /^# Please edit the object below\. Lines beginning with a '#' will be ignored,\n/,
    )
    expect(e.text).toMatch(/^ {2}replicas: 2$/m)
    expect(e.save(e.text)).toEqual({
      done: { stdout: '', stderr: 'Edit cancelled, no changes made.', exitCode: 0 },
    })
    expect(e.save('# only comments\n')).toMatchObject({
      done: { stderr: 'Edit cancelled, no changes made.' },
    })
    expect(e.cancel()).toEqual({
      stdout: '',
      stderr: 'Edit cancelled, no changes made.',
      exitCode: 0,
    })
    const before = snapshot()
    const renamed = e.save(e.text.replace('  name: web\n  namespace', '  name: other\n  namespace'))
    expect(renamed).toMatchObject({
      error: 'At least one of apiVersion, kind and name was changed',
    })
    const invalid = e.save(e.text.replace('  replicas: 2', '  replicas: 2\n  replica: 1'))
    expect(invalid).toMatchObject({
      error: expect.stringMatching(/unknown field "spec\.replica"/) as unknown,
    })
    if ('reopen' in invalid)
      expect(invalid.reopen).toMatch(
        /^# deployments\.apps "web" was not valid:\n# \* Error from server/m,
      )
    expect(snapshot()).toBe(before)
    expect(e.save(e.text.replace('  replicas: 2', '  replicas: 4'))).toEqual({
      done: { stdout: 'deployment.apps/web edited', stderr: '', exitCode: 0 },
    })
    sim.advance(30_000)
    expect(sim.cluster().get('Deployment', 'shop', 'web')?.spec.replicas).toBe(4)
    expect(auditLog(sim).at(-1)).toMatchObject({ verb: 'edit', kind: 'Deployment', name: 'web' })
    // Secrets: values show redacted and survive an edit that leaves them alone.
    const s = sh.run('kubectl edit secret web-secret').edit as EditRequest
    expect(s.text).toMatch(/"<redacted: \d+ bytes>"/)
    const bytes = sim.cluster().get('Secret', 'shop', 'web-secret')?.data
    expect(
      s.save(s.text.replace('type: Opaque', 'type: Opaque\nimmutable: false')).valueOf(),
    ).toMatchObject({ error: expect.stringMatching(/real field/) as unknown })
    expect(
      s.save(s.text.replace('metadata:\n', 'metadata:\n  labels:\n    tier: secret\n')),
    ).toMatchObject({ done: { exitCode: 0 } })
    expect(sim.cluster().get('Secret', 'shop', 'web-secret')?.data).toEqual(bytes)
    expect(sh.run('kubectl edit pod x').stderr).toMatch(/Pods belong to their Deployment/)
    expect(sh.run('kubectl edit deploy').stderr).toMatch(/one object at a time/)
    expect(sh.run('kubectl edit deploy nope').stderr).toMatch(/NotFound/)
    expect(sh.run('kubectl edit').exitCode).toBe(1)
  })
})
