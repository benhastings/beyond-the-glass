import { describe, expect, it } from 'vitest'
import { Cluster, isPodReady } from './cluster'
import { SimClock } from './clock'
import { createRunningPod } from './pods'
import { Rng } from './rng'

function setup() {
  const clock = new SimClock()
  const cluster = Cluster.create('t', 'https://t.example', clock, new Rng(1))
  return { clock, cluster }
}

describe('Cluster', () => {
  it('stores objects with uid, resourceVersion and creation time', () => {
    const { cluster } = setup()
    const cm = cluster.put<'ConfigMap'>({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: 'a', uid: '', resourceVersion: '', creationTimestamp: '' },
      data: {},
    })
    expect(cm.metadata.namespace).toBe('default')
    expect(cm.metadata.uid).toMatch(/^[0-9a-f-]{36}$/)
    expect(cm.metadata.creationTimestamp).toBe('2026-03-14T02:10:00Z')
    const rv = Number(cm.metadata.resourceVersion)
    expect(Number(cluster.put(cm).metadata.resourceVersion)).toBe(rv + 1)
    expect(cluster.get('ConfigMap', 'default', 'a')).toBe(cm)
    expect(cluster.delete('ConfigMap', 'default', 'a')).toBe(true)
    expect(cluster.delete('ConfigMap', 'default', 'a')).toBe(false)
    expect(cluster.get('ConfigMap', 'default', 'a')).toBeUndefined()
  })

  it('lists in namespace/name order, filtered by namespace and selector', () => {
    const { cluster } = setup()
    for (const [ns, name, app] of [
      ['b', 'z', 'x'],
      ['a', 'y', 'x'],
      ['a', 'b', 'w'],
    ] as const) {
      cluster.put<'ConfigMap'>({
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: {
          name,
          namespace: ns,
          uid: '',
          resourceVersion: '',
          creationTimestamp: '',
          labels: { app },
        },
        data: {},
      })
    }
    const names = (opts?: Parameters<typeof cluster.list>[1]) =>
      cluster.list('ConfigMap', opts).map((c) => `${c.metadata.namespace ?? ''}/${c.metadata.name}`)
    expect(names()).toEqual(['a/b', 'a/y', 'b/z'])
    expect(names({ namespace: 'a' })).toEqual(['a/b', 'a/y'])
    expect(names({ selector: { matchLabels: { app: 'x' } } })).toEqual(['a/y', 'b/z'])
  })

  it('folds repeated events into one, counting them', () => {
    const { clock, cluster } = setup()
    const ref = { kind: 'Pod', name: 'p', namespace: 'ns', uid: 'u1' }
    const first = cluster.recordEvent(
      ref,
      'Warning',
      'BackOff',
      'Back-off restarting failed container',
      {
        component: 'kubelet',
        host: 'n1',
      },
    )
    clock.advance(30_000)
    const again = cluster.recordEvent(
      ref,
      'Warning',
      'BackOff',
      'Back-off restarting failed container',
      {
        component: 'kubelet',
      },
    )
    expect(again).toBe(first)
    expect(again.count).toBe(2)
    expect(again.firstTimestamp).toBe('2026-03-14T02:10:00Z')
    expect(again.lastTimestamp).toBe('2026-03-14T02:10:30Z')
    expect(first.metadata.name).toMatch(/^p\.[0-9a-f]+$/)
    const other = cluster.recordEvent(ref, 'Normal', 'Pulled', 'Container image pulled', {
      component: 'kubelet',
    })
    expect(other).not.toBe(first)
    expect(other.metadata.name).not.toBe(first.metadata.name)
    expect(cluster.list('Event', { namespace: 'ns' })).toHaveLength(2)
  })

  it('derives Endpoints from Ready and not-Ready pods', () => {
    const { clock, cluster } = setup()
    const rng = new Rng(2)
    cluster.put<'Node'>({
      apiVersion: 'v1',
      kind: 'Node',
      metadata: { name: 'n1', uid: '', resourceVersion: '', creationTimestamp: '' },
      spec: {},
      status: {
        capacity: {},
        allocatable: {},
        conditions: [],
        addresses: [{ type: 'InternalIP', address: '192.0.2.10' }],
        nodeInfo: {
          kubeletVersion: 'v1.34.0',
          containerRuntimeVersion: 'containerd://2.1.3',
          osImage: 'x',
          kernelVersion: 'x',
          operatingSystem: 'linux',
          architecture: 'amd64',
        },
      },
    })
    const template = {
      metadata: { labels: { app: 'a' } },
      spec: { containers: [{ name: 'c', image: 'i:1' }] },
    }
    const ready = createRunningPod(cluster, clock, rng, {
      namespace: 'x',
      name: 'ready',
      template,
      nodeName: 'n1',
    })
    const sick = createRunningPod(cluster, clock, rng, {
      namespace: 'x',
      generateName: 'sick-',
      template,
      nodeName: 'n1',
    })
    expect(sick.metadata.generateName).toBe('sick-')
    expect(ready.status.hostIP).toBe('192.0.2.10')
    expect(ready.status.qosClass).toBe('BestEffort')
    const cond = sick.status.conditions?.find((c) => c.type === 'Ready')
    if (cond) cond.status = 'False'
    expect(isPodReady(sick)).toBe(false)
    const svc = cluster.put<'Service'>({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 's', namespace: 'x', uid: '', resourceVersion: '', creationTimestamp: '' },
      spec: {
        type: 'ClusterIP',
        selector: { app: 'a' },
        clusterIP: '10.96.0.20',
        ports: [{ name: 'http', protocol: 'TCP', port: 80, targetPort: 8080 }],
      },
      status: { loadBalancer: {} },
    })
    const ep = cluster.endpointsFor(svc)
    expect(ep.subsets).toHaveLength(1)
    expect(ep.subsets[0]?.addresses?.map((a) => a.targetRef?.name)).toEqual(['ready'])
    expect(ep.subsets[0]?.notReadyAddresses?.map((a) => a.targetRef?.name)).toEqual([
      sick.metadata.name,
    ])
    expect(ep.subsets[0]?.ports).toEqual([{ name: 'http', port: 8080, protocol: 'TCP' }])
    svc.spec.selector = { app: 'nothing' }
    expect(cluster.endpointsFor(svc).subsets).toEqual([])
  })
})
