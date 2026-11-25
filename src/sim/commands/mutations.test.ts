import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import {
  auditLog,
  DEFAULT_SYNC_MS,
  loadSimulation,
  manageNamespace,
  managedBy,
  restoreSimulation,
  setImageBehaviour,
} from '../controllers'
import { scenarioSchema } from '../core/scenario'
import { miniScenarioInput } from '../core/testing'
import { createShell } from './index'

/** The mini cluster: Deployment shop/web (2 replicas), a Service, a ConfigMap and a Secret. */
function mini() {
  const scenario = scenarioSchema.parse(miniScenarioInput())
  const sim = loadSimulation(scenario)
  sim.advance(30_000)
  const sh = createShell(sim)
  const pods = () =>
    sim
      .cluster()
      .list('Pod', { namespace: 'shop' })
      .filter((p) => !p.metadata.deletionTimestamp)
      .map((p) => p.metadata.name)
  const web = () => {
    const d = sim.cluster().get('Deployment', 'shop', 'web')
    if (!d) throw new Error('no web')
    return d
  }
  return { scenario, sim, sh, pods, web }
}

describe('E6-07 kubectl rollout status', () => {
  acTest(
    'E6-07.AC1',
    'blocks in sim time, printing kubectl’s progress lines until the rollout finishes',
    () => {
      const { sim, sh } = mini()
      expect(sh.run('kubectl set image deployment/web web=registry.example/web:1.1').stdout).toBe(
        'deployment.apps/web image updated',
      )
      const before = sim.now
      const out = sh.run('kubectl rollout status deployment/web')
      expect(out.exitCode).toBe(0)
      expect(sim.now).toBeGreaterThan(before)
      const lines = out.stdout.split('\n')
      expect(lines[0]).toMatch(
        /^Waiting for deployment "web" rollout to finish: [01] out of 2 new replicas have been updated\.\.\.$/,
      )
      expect(lines).toContain(
        'Waiting for deployment "web" rollout to finish: 1 old replicas are pending termination...',
      )
      expect(lines.at(-1)).toBe('deployment "web" successfully rolled out')
      // Every line is one kubectl prints, and none repeats back to back.
      for (const l of lines.slice(0, -1))
        expect(l).toMatch(
          /^Waiting for deployment "web" rollout to finish: \d+ (out of \d+ new replicas have been updated|old replicas are pending termination|of \d+ updated replicas are available)\.\.\.$/,
        )
      lines.slice(1).forEach((l, i) => {
        expect(l).not.toBe(lines[i])
      })
      // Already rolled out: one line, no waiting.
      const t = sim.now
      expect(sh.run('kubectl rollout status deploy/web').stdout).toBe(
        'deployment "web" successfully rolled out',
      )
      expect(sim.now).toBe(t)
    },
  )

  acTest(
    'E6-07.AC1',
    'a rollout that can’t progress ends at the progress deadline, or at --timeout',
    () => {
      const { sim, sh, web } = mini()
      setImageBehaviour(sim, 'registry.example/web:missing', { pull: 'notFound' })
      const d = web()
      d.spec.progressDeadlineSeconds = 120
      sim.cluster().put(d)
      sh.run('kubectl set image deployment/web web=registry.example/web:missing')
      const short = sh.run('kubectl rollout status deployment/web --timeout=30s')
      expect(short.stderr).toBe('error: timed out waiting for the condition')
      expect(short.exitCode).toBe(1)
      expect(short.stdout.split('\n').at(-1)).toBe(
        'Waiting for deployment "web" rollout to finish: 1 out of 2 new replicas have been updated...',
      )
      const start = sim.now
      const long = sh.run('kubectl rollout status deployment/web')
      expect(long.stderr).toBe('error: deployment "web" exceeded its progress deadline')
      expect(long.exitCode).toBe(1)
      expect(sim.now - start).toBeLessThanOrEqual(120_000)
      expect(sh.run('kubectl describe deploy web').stdout).toMatch(
        /^ {2}Progressing +False +ProgressDeadlineExceeded$/m,
      )
      // --watch=false checks once.
      expect(sh.run('kubectl rollout status deployment/web --watch=false').exitCode).toBe(1)
    },
  )
})

describe('E6-07 delete', () => {
  acTest('E6-07.AC2', 'deleting a Deployment’s pod brings a replacement with a new name', () => {
    const { sh, pods } = mini()
    const before = pods()
    const victim = before[0] ?? ''
    expect(sh.run(`kubectl delete pod ${victim}`)).toEqual({
      stdout: `pod "${victim}" deleted`,
      stderr: '',
      exitCode: 0,
    })
    const after = pods()
    expect(after).toHaveLength(before.length)
    expect(after).not.toContain(victim)
    const replacement = after.find((p) => !before.includes(p)) ?? ''
    expect(replacement).toMatch(/^web-[a-z0-9]+-[a-z0-9]{5}$/)
    // Same ReplicaSet (the hash part), new suffix.
    expect(replacement.split('-')[1]).toBe(victim.split('-')[1])
    expect(sh.run('kubectl get pods').stdout).toMatch(new RegExp(`^${replacement} `, 'm'))
  })

  it('deletes by selector, --all, cascades from a Deployment, and reports what it can’t find', () => {
    const { sim, sh, pods } = mini()
    expect(sh.run('kubectl delete pods -l app=web').stdout.split('\n')).toHaveLength(2)
    expect(pods()).toHaveLength(2)
    const forced = sh.run(`kubectl delete pod ${pods()[0] ?? ''} --force --grace-period=0`)
    expect(forced.stderr).toMatch(/^Warning: Immediate deletion does not wait/)
    expect(sh.run('kubectl delete pod nope')).toMatchObject({
      stderr: 'Error from server (NotFound): pods "nope" not found',
      exitCode: 1,
    })
    expect(sh.run('kubectl delete deploy nope').stderr).toBe(
      'Error from server (NotFound): deployments.apps "nope" not found',
    )
    expect(sh.run('kubectl delete pods').stderr).toMatch(/no name was specified/)
    expect(sh.run('kubectl delete').exitCode).toBe(1)
    expect(sh.run('kubectl delete node dev-w1').stderr).toMatch(/would take the exercise with it/)
    expect(sh.run('kubectl delete deployment/web').stdout).toBe('deployment.apps "web" deleted')
    sim.advance(10_000)
    expect(sim.cluster().list('ReplicaSet', { namespace: 'shop' })).toHaveLength(0)
    expect(pods()).toHaveLength(0)
    expect(sh.run('kubectl delete svc,cm --all').stdout).toBe(
      'service "web" deleted\nconfigmap "web-config" deleted',
    )
    expect(sh.run('kubectl delete configmap --all').stderr).toBe('No resources found')
    expect(sh.run('kubectl delete secrets --all -n empty').stderr).toBe('No resources found')
  })
})

describe('E6-07 GitOps self-heal hook', () => {
  acTest(
    'E6-07.AC3',
    'in an Argo CD-managed namespace with self-heal, changes succeed and are reverted on the next sync tick',
    () => {
      const { sim, sh, web, pods } = mini()
      manageNamespace(sim, { cluster: 'dev', namespace: 'shop', app: 'shop', selfHeal: true })
      expect(managedBy(sim, 'dev', 'shop')).toEqual({
        cluster: 'dev',
        namespace: 'shop',
        app: 'shop',
        selfHeal: true,
      })
      expect(sh.run('kubectl scale deploy/web --replicas=4').stdout).toBe(
        'deployment.apps/web scaled',
      )
      expect(sh.run('kubectl label deploy web owner=me').stdout).toBe('deployment.apps/web labeled')
      expect(sh.run('kubectl set image deploy/web web=registry.example/web:hotfix').exitCode).toBe(
        0,
      )
      expect(sh.run('kubectl delete svc web').stdout).toBe('service "web" deleted')
      expect(web().spec.replicas).toBe(4)
      sim.advance(DEFAULT_SYNC_MS)
      const d = web()
      expect(d.spec.replicas).toBe(2)
      expect(d.metadata.labels).not.toHaveProperty('owner')
      expect(d.spec.template.spec.containers[0]?.image).toBe('registry.example/web:1.0')
      expect(sim.cluster().get('Service', 'shop', 'web')).toBeDefined()
      sim.advance(60_000)
      expect(pods()).toHaveLength(2)
      const syncs = auditLog(sim).filter((e) => e.actor === 'argocd')
      expect(syncs.map((e) => `${e.kind}/${e.name}:${String(e.detail?.reason)}`)).toEqual([
        'Deployment/web:drift',
        'Service/web:missing',
      ])
      // Without self-heal, drift stays until someone syncs.
      manageNamespace(sim, {
        cluster: 'dev',
        namespace: 'shop',
        app: 'shop',
        selfHeal: false,
        intervalMs: 30_000,
      })
      sh.run('kubectl scale deploy/web --replicas=3')
      sim.advance(DEFAULT_SYNC_MS)
      expect(web().spec.replicas).toBe(3)
      expect(managedBy(sim, 'dev', 'elsewhere')).toBeUndefined()
    },
  )
})

describe('E6-07 audit log', () => {
  acTest(
    'E6-07.AC4',
    'every mutation is recorded for the challenge engine, and nothing else is',
    () => {
      const { scenario, sim, sh, pods } = mini()
      const victim = pods()[0] ?? ''
      const lines = [
        'kubectl get pods',
        'kubectl describe deploy web',
        'kubectl scale deploy web --replicas=3',
        'kubectl set image deploy/web web=registry.example/web:1.1',
        'kubectl rollout status deploy/web',
        'kubectl rollout history deploy/web',
        'kubectl rollout undo deploy/web',
        'kubectl rollout restart deploy/web',
        'kubectl rollout pause deploy/web',
        'kubectl rollout resume deploy/web',
        `kubectl delete pod ${victim}`,
        'kubectl label cm web-config tier=config',
        'kubectl annotate deploy web kubernetes.io/change-cause=testing',
        'kubectl delete pod nope',
        'kubectl scale deploy nope --replicas=1',
        'kubectl label cm web-config tier=config',
      ]
      for (const l of lines) sh.run(l)
      const log = auditLog(sim)
      expect(log.map((e) => `${e.verb} ${e.kind}/${e.name}`)).toEqual([
        'scale Deployment/web',
        'set-image Deployment/web',
        'rollout-undo Deployment/web',
        'rollout-restart Deployment/web',
        'rollout-pause Deployment/web',
        'rollout-resume Deployment/web',
        `delete Pod/${victim}`,
        'label ConfigMap/web-config',
        'annotate Deployment/web',
      ])
      expect(
        log.every((e) => e.actor === 'learner' && e.cluster === 'dev' && e.namespace === 'shop'),
      ).toBe(true)
      expect(log[0]).toMatchObject({
        command: 'kubectl scale deploy web',
        detail: { from: 2, to: 3 },
      })
      expect(log[1]?.detail).toEqual({
        changes: [
          { container: 'web', from: 'registry.example/web:1.0', image: 'registry.example/web:1.1' },
        ],
      })
      expect(log[2]?.detail).toEqual({ toRevision: 1 })
      expect(log[6]?.detail).toMatchObject({
        owner: expect.stringMatching(/^ReplicaSet\/web-/) as unknown,
      })
      expect(log.map((e) => e.t)).toEqual([...log.map((e) => e.t)].sort((a, b) => a - b))
      // It survives a reload, and the copy handed out can't change the record.
      const restored = restoreSimulation(scenario, sim.snapshot())
      expect(auditLog(restored)).toEqual(log)
      auditLog(sim).pop()
      expect(auditLog(sim)).toHaveLength(log.length)
    },
  )
})

describe('E6-07 command details', () => {
  it('rollout history, undo --to-revision, pause, resume and restart', () => {
    const { sh } = mini()
    sh.run('kubectl annotate deploy web kubernetes.io/change-cause=first')
    sh.run('kubectl set image deploy/web web=registry.example/web:1.1')
    sh.run('kubectl rollout status deploy/web')
    expect(sh.run('kubectl rollout history deploy/web').stdout).toBe(
      'deployment.apps/web \nREVISION  CHANGE-CAUSE\n1         <none>\n2         <none>\n',
    )
    expect(sh.run('kubectl rollout history deploy/web --revision=2').stdout).toMatch(
      /^deployment\.apps\/web with revision #2\nPod Template:\n {2}Labels:/,
    )
    expect(sh.run('kubectl rollout history deploy/web --revision=9').exitCode).toBe(1)
    expect(sh.run('kubectl rollout undo deploy/web --to-revision=2').stdout).toBe(
      'deployment.apps/web skipped rollback (current template already matches revision 2)',
    )
    expect(sh.run('kubectl rollout undo deploy/web --to-revision=7').stderr).toBe(
      'error: unable to find specified revision 7 in history',
    )
    expect(sh.run('kubectl rollout undo deploy/web --to-revision=x').exitCode).toBe(1)
    expect(sh.run('kubectl rollout undo deploy/web --to-revision=1').stdout).toBe(
      'deployment.apps/web rolled back',
    )
    expect(sh.run('kubectl rollout pause deploy/web').stdout).toBe('deployment.apps/web paused')
    expect(sh.run('kubectl rollout pause deploy/web').stderr).toBe(
      'error: deployments.apps "web" is already paused',
    )
    expect(sh.run('kubectl rollout restart deploy/web').stderr).toMatch(
      /can't restart paused deployment/,
    )
    expect(sh.run('kubectl rollout resume deploy/web').stdout).toBe('deployment.apps/web resumed')
    expect(sh.run('kubectl rollout resume deploy/web').stderr).toMatch(/is not paused/)
    expect(sh.run('kubectl rollout restart deploy/web').stdout).toBe(
      'deployment.apps/web restarted',
    )
    expect(sh.run('kubectl get deploy web -o yaml').stdout).toMatch(
      /kubectl\.kubernetes\.io\/restartedAt: "2026-/,
    )
    expect(sh.run('kubectl rollout').exitCode).toBe(1)
    expect(sh.run('kubectl rollout explode deploy/web').stderr).toMatch(/unknown command "explode"/)
    expect(sh.run('kubectl rollout status').stderr).toMatch(/required resource not specified/)
    expect(sh.run('kubectl rollout status svc/web').stderr).toBe(
      'error: no status viewer has been implemented for "Service"',
    )
    expect(sh.run('kubectl rollout status deploy/nope').stderr).toMatch(/NotFound/)
    expect(sh.run('kubectl rollout status deploy/web --timeout=soon').exitCode).toBe(1)
    expect(sh.run('kubectl rollout statsu deploy/web').exitCode).toBe(1)
    expect(sh.complete('kubectl rollout st').candidates).toEqual(['status'])
    expect(sh.complete('kubectl rollout status deployment/w').candidates).toEqual([
      'deployment/web',
    ])
  })

  it('scale', () => {
    const { sh, pods, sim } = mini()
    expect(sh.run('kubectl scale deployment web --replicas=3').stdout).toBe(
      'deployment.apps/web scaled',
    )
    sim.advance(30_000)
    expect(pods()).toHaveLength(3)
    expect(sh.run('kubectl scale deploy/web').stderr).toBe(
      'error: required flag(s) "replicas" not set',
    )
    expect(sh.run('kubectl scale deploy/web --replicas=-1').stderr).toMatch(
      /greater than or equal to 0/,
    )
    expect(sh.run('kubectl scale deploy/web --replicas=two').stderr).toMatch(
      /invalid argument "two"/,
    )
    expect(sh.run('kubectl scale deploy/web --replicas=1 --current-replicas=2').stderr).toBe(
      'error: Expected replicas to be 2, was 3',
    )
    expect(sh.run('kubectl scale deploy --replicas=1').stderr).toMatch(/no name was specified/)
    expect(sh.run('kubectl scale svc/web --replicas=1').stderr).toMatch(
      /no scaler has been implemented/,
    )
    expect(sh.run('kubectl scale deploy/nope --replicas=1').exitCode).toBe(1)
    const rs = sim.cluster().list('ReplicaSet', { namespace: 'shop' })[0]?.metadata.name ?? ''
    expect(sh.run(`kubectl scale rs ${rs} --replicas=1`).stdout).toBe(
      `replicaset.apps/${rs} scaled`,
    )
    expect(sh.run('kubectl scale deploy/web --replicas=1 -o name --context nowhere').exitCode).toBe(
      1,
    )
  })

  it('set image', () => {
    const { sh } = mini()
    expect(sh.run('kubectl set image deploy/web *=registry.example/web:2.0').stdout).toBe(
      'deployment.apps/web image updated',
    )
    // Nothing changes when it's already that image.
    expect(sh.run('kubectl set image deploy/web web=registry.example/web:2.0').stdout).toBe('')
    expect(sh.run('kubectl set image deploy/web nope=x:1').stderr).toBe(
      'error: unable to find container named "nope"',
    )
    expect(sh.run('kubectl set image deploy/web').stderr).toMatch(
      /at least one image update is required/,
    )
    expect(sh.run('kubectl set image deploy/nope web=x:1').exitCode).toBe(1)
    expect(sh.run('kubectl set image pod/x web=x:1').stderr).toMatch(/sets images on deployments/)
    expect(sh.run('kubectl set env deploy/web A=b').stderr).toMatch(
      /supports `kubectl set image` only/,
    )
    expect(sh.run('kubectl set').exitCode).toBe(1)
    expect(sh.run('kubectl set image dpeloy/web web=x:1').stderr).toMatch(
      /Did you mean `deploy`\?|doesn't have a resource type/,
    )
  })

  it('label and annotate', () => {
    const { sh, sim, pods } = mini()
    const pod = pods()[0] ?? ''
    expect(sh.run(`kubectl label pod ${pod} debug=true`).stdout).toBe(`pod/${pod} labeled`)
    expect(sh.run(`kubectl label pod ${pod} debug=false`).stderr).toBe(
      "error: 'debug' already has a value (true), and --overwrite is false",
    )
    expect(sh.run(`kubectl label pod ${pod} debug=false --overwrite`).stdout).toBe(
      `pod/${pod} labeled`,
    )
    expect(sh.run(`kubectl label pod ${pod} debug=false --overwrite`).stdout).toBe(
      `pod/${pod} not labeled`,
    )
    expect(sh.run(`kubectl label pod ${pod} debug-`).stdout).toBe(`pod/${pod} labeled`)
    expect(sh.run(`kubectl label pod ${pod} 'bad value=x'`).exitCode).toBe(1)
    expect(sh.run(`kubectl label pod ${pod} ok=not/valid`).stderr).toMatch(/invalid label value/)
    expect(sh.run(`kubectl label pod ${pod}`).stderr).toMatch(
      /at least one label update is required/,
    )
    expect(sh.run('kubectl label pod nope a=b').exitCode).toBe(1)
    expect(sh.run('kubectl label pod a=b').exitCode).toBe(1)
    expect(sh.run('kubectl label node dev-w1 zone=a').stdout).toBe('node/dev-w1 labeled')
    expect(auditLog(sim).at(-1)).not.toHaveProperty('namespace')
    // Taking a pod out of its ReplicaSet's selector makes the ReplicaSet replace it.
    sh.run(`kubectl label pod ${pod} app=quarantine --overwrite`)
    sim.advance(30_000)
    expect(
      sim.cluster().list('Pod', { namespace: 'shop', selector: { matchLabels: { app: 'web' } } }),
    ).toHaveLength(2)
    expect(sh.run('kubectl annotate deploy/web note="hello there"').stdout).toBe(
      'deployment.apps/web annotated',
    )
    expect(sh.run('kubectl get deploy web -o yaml').stdout).toMatch(/^ {4}note: hello there$/m)
  })
})
