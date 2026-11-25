import type { Cluster } from './cluster.ts'
import type { SimClock } from './clock.ts'
import { podTemplateHash } from './names.ts'
import { condition, createRunningPod, ownerRef } from './pods.ts'
import type { Rng } from './rng.ts'
import type { ContainerState, Node, Pod, PodTemplateSpec, Service } from './resources.ts'
import type { Manifest, ScenarioCluster } from './scenario.ts'
import { refreshDeploymentStatus, refreshReplicaSetStatus } from './workloads.ts'

type DeploymentManifest = Extract<Manifest, { kind: 'Deployment' }>
type Override = ScenarioCluster['podOverrides'][number]

const SYSTEM_NAMESPACES = ['default', 'kube-node-lease', 'kube-public', 'kube-system']

/**
 * Builds a cluster's state at scenario start from its scenario definition: nodes, system workloads,
 * the scenario's manifests, Deployments' ReplicaSets and running pods, then any pod overrides.
 */
export function materialize(
  cluster: Cluster,
  sc: ScenarioCluster,
  clock: SimClock,
  rng: Rng,
): void {
  const born = clock.resolve(sc.age)
  const createdAt = (meta: { creationTimestamp?: string | undefined }) =>
    meta.creationTimestamp !== undefined ? clock.resolve(meta.creationTimestamp) : born

  const namespaces = new Set([
    ...SYSTEM_NAMESPACES,
    ...(sc.system === 'kind' ? ['local-path-storage'] : []),
  ])
  for (const r of sc.resources) {
    if (r.kind === 'Namespace') namespaces.add(r.metadata.name)
    else namespaces.add(r.metadata.namespace ?? 'default')
  }
  for (const ns of [...namespaces].sort()) {
    const m = sc.resources.find((r) => r.kind === 'Namespace' && r.metadata.name === ns)
    cluster.put<'Namespace'>({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: ns,
        uid: '',
        resourceVersion: '',
        creationTimestamp: clock.iso(m ? createdAt(m.metadata) : born),
        labels: { 'kubernetes.io/metadata.name': ns, ...m?.metadata.labels },
      },
      status: { phase: 'Active' },
    })
  }

  sc.nodes.forEach((n, i) => cluster.put(makeNode(n, i, sc.kubernetesVersion, clock.iso(born))))
  const workers = sc.nodes.filter((n) => n.role === 'worker').map((n) => n.name)
  const controlPlane = sc.nodes.find((n) => n.role === 'control-plane')?.name ?? workers[0] ?? ''
  let next = 0
  const schedule = () => workers[next++ % workers.length] ?? controlPlane

  const usedIPs = new Set<string>()
  const serviceIP = (fixed?: string) => {
    if (fixed) {
      usedIPs.add(fixed)
      return fixed
    }
    for (;;) {
      const ip = `10.96.${String(rng.int(256))}.${String(1 + rng.int(254))}`
      if (!usedIPs.has(ip)) {
        usedIPs.add(ip)
        return ip
      }
    }
  }

  if (sc.system === 'kind') addKindSystem(cluster, sc, clock, rng, born, controlPlane, serviceIP)

  const podsByDeployment = new Map<string, Pod[]>()
  for (const r of sc.resources) {
    const ns = r.metadata.namespace ?? 'default'
    const at = clock.iso(createdAt(r.metadata))
    const meta = {
      name: r.metadata.name,
      namespace: ns,
      uid: '',
      resourceVersion: '',
      creationTimestamp: at,
      ...(r.metadata.labels ? { labels: r.metadata.labels } : {}),
      ...(r.metadata.annotations ? { annotations: r.metadata.annotations } : {}),
    }
    switch (r.kind) {
      case 'Namespace':
        break
      case 'ConfigMap':
        cluster.put<'ConfigMap'>({
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: meta,
          data: { ...r.data },
        })
        break
      case 'Secret':
        cluster.put<'Secret'>({
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: meta,
          type: r.type,
          data: structuredClone(r.data),
        })
        break
      case 'Service': {
        const ip = serviceIP(r.spec.clusterIP)
        cluster.put<'Service'>({
          apiVersion: 'v1',
          kind: 'Service',
          metadata: meta,
          spec: {
            type: r.spec.type,
            ...(r.spec.selector ? { selector: r.spec.selector } : {}),
            clusterIP: ip,
            clusterIPs: [ip],
            sessionAffinity: 'None',
            ports: r.spec.ports.map((p) => ({ ...p, targetPort: p.targetPort ?? p.port })),
          },
          status: { loadBalancer: {} },
        })
        break
      }
      case 'Deployment':
        podsByDeployment.set(
          `${ns}/${r.metadata.name}`,
          createDeployment(cluster, clock, rng, r, ns, createdAt(r.metadata), schedule),
        )
        break
    }
  }

  for (const o of sc.podOverrides) {
    const pod = podsByDeployment.get(`${o.namespace}/${o.deployment}`)?.[o.replica]
    if (pod) applyOverride(cluster, clock, pod, o)
  }
  for (const d of cluster.list('Deployment')) {
    for (const rs of cluster.list('ReplicaSet', { namespace: d.metadata.namespace ?? 'default' }))
      if (rs.metadata.ownerReferences?.some((o) => o.uid === d.metadata.uid))
        refreshReplicaSetStatus(cluster, rs)
    refreshDeploymentStatus(cluster, d, d.metadata.creationTimestamp)
  }
}

function makeNode(
  n: ScenarioCluster['nodes'][number],
  i: number,
  version: string,
  at: string,
): Node {
  const cp = n.role === 'control-plane'
  const ok = (type: string, reason: string, message: string, status = false) =>
    condition(type, status, at, {
      reason,
      message,
      lastHeartbeatTime: at,
    })
  const resources = {
    cpu: n.cpu,
    memory: n.memory,
    pods: String(n.pods),
    'ephemeral-storage': '102350Mi',
  }
  return {
    apiVersion: 'v1',
    kind: 'Node',
    metadata: {
      name: n.name,
      uid: '',
      resourceVersion: '',
      creationTimestamp: at,
      labels: {
        'beta.kubernetes.io/arch': 'amd64',
        'beta.kubernetes.io/os': 'linux',
        'kubernetes.io/arch': 'amd64',
        'kubernetes.io/hostname': n.name,
        'kubernetes.io/os': 'linux',
        ...(cp ? { 'node-role.kubernetes.io/control-plane': '' } : {}),
      },
      annotations: { 'node.alpha.kubernetes.io/ttl': '0' },
    },
    spec: {
      podCIDR: `10.244.${String(i)}.0/24`,
      ...(cp
        ? { taints: [{ key: 'node-role.kubernetes.io/control-plane', effect: 'NoSchedule' }] }
        : {}),
    },
    status: {
      capacity: resources,
      allocatable: resources,
      conditions: [
        ok(
          'MemoryPressure',
          'KubeletHasSufficientMemory',
          'kubelet has sufficient memory available',
        ),
        ok('DiskPressure', 'KubeletHasNoDiskPressure', 'kubelet has no disk pressure'),
        ok('PIDPressure', 'KubeletHasSufficientPID', 'kubelet has sufficient PID available'),
        ok('Ready', 'KubeletReady', 'kubelet is posting ready status', true),
      ],
      // RFC 5737 documentation addresses: never a real network.
      addresses: [
        { type: 'InternalIP', address: `198.51.100.${String(10 + i)}` },
        { type: 'Hostname', address: n.name },
      ],
      nodeInfo: {
        kubeletVersion: version,
        containerRuntimeVersion: 'containerd://2.1.3',
        osImage: 'Debian GNU/Linux 12 (bookworm)',
        kernelVersion: '6.8.0-60-generic',
        operatingSystem: 'linux',
        architecture: 'amd64',
      },
    },
  }
}

export function normalizeTemplate(t: DeploymentManifest['spec']['template']): PodTemplateSpec {
  return {
    metadata: {
      labels: { ...t.metadata.labels },
      ...(t.metadata.annotations ? { annotations: { ...t.metadata.annotations } } : {}),
    },
    spec: {
      ...structuredClone(t.spec),
      containers: t.spec.containers.map((c) => ({
        imagePullPolicy:
          c.image.endsWith(':latest') || !/:[^/]+$/.test(c.image) ? 'Always' : 'IfNotPresent',
        ...structuredClone(c),
      })),
    },
  }
}

/** A Deployment with its first ReplicaSet (revision 1) and running pods. Returns the pods in creation order. */
export function createDeployment(
  cluster: Cluster,
  clock: SimClock,
  rng: Rng,
  m: DeploymentManifest,
  ns: string,
  createdAt: number,
  schedule: () => string,
): Pod[] {
  const template = normalizeTemplate(m.spec.template)
  const at = clock.iso(createdAt)
  const d = cluster.put<'Deployment'>({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: m.metadata.name,
      namespace: ns,
      uid: '',
      resourceVersion: '',
      generation: 1,
      creationTimestamp: at,
      ...(m.metadata.labels ? { labels: m.metadata.labels } : {}),
      annotations: { 'deployment.kubernetes.io/revision': '1', ...m.metadata.annotations },
    },
    spec: {
      replicas: m.spec.replicas,
      selector: { matchLabels: m.spec.selector.matchLabels },
      template,
      strategy: m.spec.strategy
        ? { ...m.spec.strategy }
        : { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' } },
      revisionHistoryLimit: m.spec.revisionHistoryLimit ?? 10,
      progressDeadlineSeconds: m.spec.progressDeadlineSeconds ?? 600,
      ...(m.spec.minReadySeconds !== undefined ? { minReadySeconds: m.spec.minReadySeconds } : {}),
    },
    status: {},
  })
  const hash = podTemplateHash(template)
  const rsTemplate: PodTemplateSpec = {
    ...structuredClone(template),
    metadata: {
      ...template.metadata,
      labels: { ...template.metadata.labels, 'pod-template-hash': hash },
    },
  }
  const rs = cluster.put<'ReplicaSet'>({
    apiVersion: 'apps/v1',
    kind: 'ReplicaSet',
    metadata: {
      name: `${d.metadata.name}-${hash}`,
      namespace: ns,
      uid: '',
      resourceVersion: '',
      generation: 1,
      creationTimestamp: at,
      labels: { ...template.metadata.labels, 'pod-template-hash': hash },
      annotations: {
        'deployment.kubernetes.io/desired-replicas': String(m.spec.replicas),
        'deployment.kubernetes.io/max-replicas': String(m.spec.replicas + 1),
        'deployment.kubernetes.io/revision': '1',
      },
      ownerReferences: [ownerRef(d)],
    },
    spec: {
      replicas: m.spec.replicas,
      selector: { matchLabels: { ...m.spec.selector.matchLabels, 'pod-template-hash': hash } },
      template: rsTemplate,
    },
    status: { replicas: 0 },
  })
  const pods: Pod[] = []
  for (let i = 0; i < m.spec.replicas; i++) {
    pods.push(
      createRunningPod(cluster, clock, rng, {
        namespace: ns,
        generateName: `${rs.metadata.name}-`,
        template: rsTemplate,
        owner: ownerRef(rs),
        nodeName: schedule(),
        createdAt: createdAt + 1000,
      }),
    )
  }
  return pods
}

const PENDING_REASONS = new Set([
  'ContainerCreating',
  'ErrImagePull',
  'ImagePullBackOff',
  'CreateContainerConfigError',
  'InvalidImageName',
])

function applyOverride(cluster: Cluster, clock: SimClock, pod: Pod, o: Override): void {
  if (o.createdAt !== undefined) {
    const t = clock.iso(clock.resolve(o.createdAt))
    pod.metadata.creationTimestamp = t
    pod.status.startTime = t
    for (const c of pod.status.conditions ?? []) c.lastTransitionTime = t
  }
  const resolveState = (
    s: NonNullable<Override['containers'][string]['state']>,
  ): ContainerState => ({
    ...(s.waiting ? { waiting: { ...s.waiting } } : {}),
    ...(s.running ? { running: { startedAt: clock.iso(clock.resolve(s.running.startedAt)) } } : {}),
    ...(s.terminated
      ? {
          terminated: {
            ...s.terminated,
            ...(s.terminated.startedAt
              ? { startedAt: clock.iso(clock.resolve(s.terminated.startedAt)) }
              : {}),
            ...(s.terminated.finishedAt
              ? { finishedAt: clock.iso(clock.resolve(s.terminated.finishedAt)) }
              : {}),
          },
        }
      : {}),
  })
  let everStarted = false
  for (const cs of pod.status.containerStatuses ?? []) {
    const ov = o.containers[cs.name]
    if (!ov) {
      everStarted = true
      continue
    }
    if (ov.state) cs.state = resolveState(ov.state)
    if (ov.lastState) cs.lastState = resolveState(ov.lastState)
    if (ov.restartCount !== undefined) cs.restartCount = ov.restartCount
    cs.ready = ov.ready ?? cs.state.running !== undefined
    cs.started = cs.state.running !== undefined
    const w = cs.state.waiting
    if (w?.reason === 'CrashLoopBackOff' && w.message === undefined)
      w.message = `back-off 5m0s restarting failed container=${cs.name} pod=${pod.metadata.name}_${pod.metadata.namespace ?? 'default'}(${pod.metadata.uid})`
    if (!(w && PENDING_REASONS.has(w.reason) && !cs.lastState.terminated)) everStarted = true
    if (!cs.state.running && !cs.lastState.terminated && !cs.state.terminated) delete cs.containerID
  }
  pod.status.phase = everStarted ? 'Running' : 'Pending'
  const allReady = (pod.status.containerStatuses ?? []).every((c) => c.ready)
  const now = clock.iso()
  for (const c of pod.status.conditions ?? []) {
    if (c.type === 'Ready' || c.type === 'ContainersReady') {
      if ((c.status === 'True') !== allReady) {
        c.status = allReady ? 'True' : 'False'
        c.lastTransitionTime = now
      }
      if (!allReady) {
        const notReady = (pod.status.containerStatuses ?? [])
          .filter((x) => !x.ready)
          .map((x) => x.name)
        c.reason = 'ContainersNotReady'
        c.message = `containers with unready status: [${notReady.join(' ')}]`
      }
    }
  }
  cluster.put(pod)
  crashLoopHistory(cluster, clock, pod)
}

/**
 * The events a pod that has been crash-looping since before the scenario began would already have, so
 * `describe pod` and `get events` tell its story: scheduled, started and backed off, many times over.
 */
function crashLoopHistory(cluster: Cluster, clock: SimClock, pod: Pod): void {
  const ns = pod.metadata.namespace ?? 'default'
  const created = pod.metadata.creationTimestamp
  const node = pod.spec.nodeName
  const ref = (container?: string) => ({
    kind: 'Pod',
    name: pod.metadata.name,
    namespace: ns,
    uid: pod.metadata.uid,
    apiVersion: 'v1',
    ...(container ? { fieldPath: `spec.containers{${container}}` } : {}),
  })
  const kubelet = { component: 'kubelet', ...(node ? { host: node } : {}) }
  const after = (ms: number) => clock.iso(Date.parse(created) - clock.epochMs + ms)
  if (node)
    cluster.recordEvent(
      ref(),
      'Normal',
      'Scheduled',
      `Successfully assigned ${ns}/${pod.metadata.name} to ${node}`,
      { component: 'default-scheduler' },
      { first: created, last: created, count: 1 },
    )
  for (const cs of pod.status.containerStatuses ?? []) {
    const last = cs.lastState.terminated
    if (cs.state.waiting?.reason !== 'CrashLoopBackOff' || !last) continue
    const starts = cs.restartCount + 1
    const lastStart = last.startedAt ?? clock.iso()
    const h = (count: number, lastAt: string) => ({ first: after(3000), last: lastAt, count })
    cluster.recordEvent(
      ref(cs.name),
      'Normal',
      'Pulled',
      `Container image "${cs.image}" already present on machine`,
      kubelet,
      h(starts, lastStart),
    )
    cluster.recordEvent(
      ref(cs.name),
      'Normal',
      'Created',
      `Created container: ${cs.name}`,
      kubelet,
      h(starts, lastStart),
    )
    cluster.recordEvent(
      ref(cs.name),
      'Normal',
      'Started',
      `Started container ${cs.name}`,
      kubelet,
      h(starts, lastStart),
    )
    cluster.recordEvent(
      ref(cs.name),
      'Warning',
      'BackOff',
      `Back-off restarting failed container ${cs.name} in pod ${pod.metadata.name}_${ns}(${pod.metadata.uid})`,
      kubelet,
      {
        first: after(6000),
        last: last.finishedAt ?? clock.iso(),
        count: Math.max(1, cs.restartCount * 4),
      },
    )
  }
}

const KIND_IMAGES = {
  coredns: 'registry.k8s.io/coredns/coredns:v1.12.1',
  etcd: 'registry.k8s.io/etcd:3.6.4-0',
  kindnet: 'docker.io/kindest/kindnetd:v20250512-df8de77b',
  localPath: 'docker.io/kindest/local-path-provisioner:v20250214-acbabc1a',
}

/** The workloads and Services a fresh kind cluster runs, so `get pods -A` looks like one. */
function addKindSystem(
  cluster: Cluster,
  sc: ScenarioCluster,
  clock: SimClock,
  rng: Rng,
  born: number,
  controlPlane: string,
  serviceIP: (fixed?: string) => string,
): void {
  const v = sc.kubernetesVersion
  const at = clock.iso(born)
  const svc = (
    ns: string,
    name: string,
    ip: string,
    ports: Service['spec']['ports'],
    selector?: Record<string, string>,
    labels?: Record<string, string>,
  ) =>
    cluster.put<'Service'>({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name,
        namespace: ns,
        uid: '',
        resourceVersion: '',
        creationTimestamp: at,
        ...(labels ? { labels } : {}),
      },
      spec: {
        type: 'ClusterIP',
        ...(selector ? { selector } : {}),
        clusterIP: serviceIP(ip),
        clusterIPs: [ip],
        sessionAffinity: 'None',
        ports,
      },
      status: { loadBalancer: {} },
    })
  svc(
    'default',
    'kubernetes',
    '10.96.0.1',
    [{ name: 'https', protocol: 'TCP', port: 443, targetPort: 6443 }],
    undefined,
    {
      component: 'apiserver',
      provider: 'kubernetes',
    },
  )
  svc(
    'kube-system',
    'kube-dns',
    '10.96.0.10',
    [
      { name: 'dns', protocol: 'UDP', port: 53, targetPort: 53 },
      { name: 'dns-tcp', protocol: 'TCP', port: 53, targetPort: 53 },
      { name: 'metrics', protocol: 'TCP', port: 9153, targetPort: 9153 },
    ],
    { 'k8s-app': 'kube-dns' },
    { 'k8s-app': 'kube-dns', 'kubernetes.io/name': 'CoreDNS' },
  )

  const nodes = cluster.list('Node')
  const cp = cluster.get('Node', undefined, controlPlane)
  const staticPod = (component: string, image: string) => {
    const pod = createRunningPod(cluster, clock, rng, {
      namespace: 'kube-system',
      name: `${component}-${controlPlane}`,
      template: {
        metadata: { labels: { component, tier: 'control-plane' } },
        spec: {
          containers: [
            {
              name: component,
              image,
              resources: { requests: { cpu: component === 'etcd' ? '100m' : '200m' } },
            },
          ],
        },
      },
      ...(cp
        ? {
            owner: {
              apiVersion: 'v1',
              kind: 'Node',
              name: controlPlane,
              uid: cp.metadata.uid,
              controller: true,
            },
          }
        : {}),
      nodeName: controlPlane,
      createdAt: born,
    })
    // Static pods use the host network.
    const hostIP = pod.status.hostIP
    if (hostIP) pod.status.podIP = hostIP
    cluster.put(pod)
  }
  staticPod('etcd', KIND_IMAGES.etcd)
  staticPod('kube-apiserver', `registry.k8s.io/kube-apiserver:${v}`)
  staticPod('kube-controller-manager', `registry.k8s.io/kube-controller-manager:${v}`)
  staticPod('kube-scheduler', `registry.k8s.io/kube-scheduler:${v}`)

  const daemon = (name: string, image: string, labels: Record<string, string>) => {
    for (const n of nodes) {
      const pod = createRunningPod(cluster, clock, rng, {
        namespace: 'kube-system',
        generateName: `${name}-`,
        template: { metadata: { labels }, spec: { containers: [{ name, image }] } },
        owner: {
          apiVersion: 'apps/v1',
          kind: 'DaemonSet',
          name,
          uid: `ds-${name}`,
          controller: true,
          blockOwnerDeletion: true,
        },
        nodeName: n.metadata.name,
        createdAt: born + 5000,
      })
      const hostIP = pod.status.hostIP
      if (hostIP) pod.status.podIP = hostIP
      cluster.put(pod)
    }
  }
  daemon('kindnet', KIND_IMAGES.kindnet, { app: 'kindnet', 'k8s-app': 'kindnet', tier: 'node' })
  daemon('kube-proxy', `registry.k8s.io/kube-proxy:${v}`, { 'k8s-app': 'kube-proxy' })

  const onControlPlane = () => controlPlane
  createDeployment(
    cluster,
    clock,
    rng,
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'coredns', namespace: 'kube-system', labels: { 'k8s-app': 'kube-dns' } },
      spec: {
        replicas: 2,
        selector: { matchLabels: { 'k8s-app': 'kube-dns' } },
        template: {
          metadata: { labels: { 'k8s-app': 'kube-dns' } },
          spec: {
            containers: [
              {
                name: 'coredns',
                image: KIND_IMAGES.coredns,
                resources: {
                  requests: { cpu: '100m', memory: '70Mi' },
                  limits: { memory: '170Mi' },
                },
              },
            ],
          },
        },
        strategy: { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: 1 } },
      },
    },
    'kube-system',
    born + 10_000,
    onControlPlane,
  )
  createDeployment(
    cluster,
    clock,
    rng,
    {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'local-path-provisioner', namespace: 'local-path-storage' },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'local-path-provisioner' } },
        template: {
          metadata: { labels: { app: 'local-path-provisioner' } },
          spec: { containers: [{ name: 'local-path-provisioner', image: KIND_IMAGES.localPath }] },
        },
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' },
        },
      },
    },
    'local-path-storage',
    born + 10_000,
    onControlPlane,
  )
}

export type { DeploymentManifest }
