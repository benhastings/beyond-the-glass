import type { Cluster } from './cluster.ts'
import type { SimClock } from './clock.ts'
import { digestOf, imageId, nameSuffix } from './names.ts'
import type { Rng } from './rng.ts'
import type {
  Condition,
  ContainerStatus,
  Deployment,
  OwnerReference,
  Pod,
  PodTemplateSpec,
  ReplicaSet,
} from './resources.ts'

export interface NewPod {
  namespace: string
  /** Full name; when absent, `generateName` plus a five-character suffix (like the API server). */
  name?: string
  generateName?: string
  template: PodTemplateSpec
  owner?: OwnerReference
  nodeName?: string
  /** Sim time the pod was created (default: now). */
  createdAt?: number
}

/** Pod IPs: 10.244.<node index>.<n>, the kind/flannel layout, handed out in order per node. */
export function nextPodIP(cluster: Cluster, nodeName: string): string {
  const nodes = cluster.list('Node')
  const idx = Math.max(
    0,
    nodes.findIndex((n) => n.metadata.name === nodeName),
  )
  const used = new Set(cluster.list('Pod').map((p) => p.status.podIP))
  for (let host = 2; host < 255; host++) {
    const ip = `10.244.${String(idx)}.${String(host)}`
    if (!used.has(ip)) return ip
  }
  throw new RangeError(`node ${nodeName} has no free pod IPs`)
}

function qosClass(template: PodTemplateSpec): NonNullable<Pod['status']['qosClass']> {
  const cs = template.spec.containers
  const has = (k: 'requests' | 'limits') =>
    cs.some((c) => Object.keys(c.resources?.[k] ?? {}).length > 0)
  if (!has('requests') && !has('limits')) return 'BestEffort'
  const guaranteed = cs.every((c) => {
    const l = c.resources?.limits ?? {}
    const r = c.resources?.requests ?? l
    return l.cpu !== undefined && l.memory !== undefined && r.cpu === l.cpu && r.memory === l.memory
  })
  return guaranteed ? 'Guaranteed' : 'Burstable'
}

export function condition(
  type: string,
  status: boolean,
  at: string,
  extra: Partial<Condition> = {},
): Condition {
  return {
    type,
    status: status ? 'True' : 'False',
    lastTransitionTime: at,
    ...extra,
  }
}

/** A running, ready container status for `image`, started at `startedAt`. */
export function runningStatus(
  name: string,
  image: string,
  startedAt: string,
  rng: Rng,
): ContainerStatus {
  return {
    name,
    image,
    imageID: imageId(image),
    containerID: `containerd://${digestOf(`${name}:${rng.hex(16)}`)}`,
    ready: true,
    started: true,
    restartCount: 0,
    state: { running: { startedAt } },
    lastState: {},
  }
}

/**
 * Creates a pod that is already scheduled, running and Ready: the state a healthy workload is in when a
 * scenario starts. Controllers (E6-02) move new pods through Pending and ContainerCreating instead.
 */
export function createRunningPod(cluster: Cluster, clock: SimClock, rng: Rng, spec: NewPod): Pod {
  const name = spec.name ?? `${spec.generateName ?? 'pod-'}${nameSuffix(rng)}`
  const created = spec.createdAt ?? clock.now
  const at = clock.iso(created)
  // Containers start a couple of seconds after the pod is created.
  const startedAt = clock.iso(created + 2000 + rng.int(3000))
  const nodeName = spec.nodeName
  const node = nodeName ? cluster.get('Node', undefined, nodeName) : undefined
  const hostIP = node?.status.addresses.find((a) => a.type === 'InternalIP')?.address
  const probe = { lastProbeTime: null }
  const pod: Pod = {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: {
      name,
      namespace: spec.namespace,
      uid: '',
      resourceVersion: '',
      creationTimestamp: at,
      labels: { ...spec.template.metadata.labels },
      ...(spec.template.metadata.annotations
        ? { annotations: { ...spec.template.metadata.annotations } }
        : {}),
      ...(spec.owner ? { ownerReferences: [spec.owner] } : {}),
      ...(spec.generateName && !spec.name ? { generateName: spec.generateName } : {}),
    },
    spec: {
      restartPolicy: 'Always',
      terminationGracePeriodSeconds: 30,
      serviceAccountName: 'default',
      ...structuredClone(spec.template.spec),
      ...(nodeName ? { nodeName } : {}),
    },
    status: {
      phase: 'Running',
      conditions: [
        condition('PodReadyToStartContainers', true, startedAt, probe),
        condition('Initialized', true, at, probe),
        condition('Ready', true, startedAt, probe),
        condition('ContainersReady', true, startedAt, probe),
        condition('PodScheduled', true, at, probe),
      ],
      ...(hostIP ? { hostIP } : {}),
      ...(nodeName ? { podIP: nextPodIP(cluster, nodeName) } : {}),
      startTime: at,
      qosClass: qosClass(spec.template),
      containerStatuses: spec.template.spec.containers.map((c) =>
        runningStatus(c.name, c.image, startedAt, rng),
      ),
    },
  }
  return cluster.put<'Pod'>(pod)
}

export function ownerRef(
  obj:
    | Deployment
    | ReplicaSet
    | { apiVersion: string; kind: string; metadata: { name: string; uid: string } },
): OwnerReference {
  return {
    apiVersion: obj.apiVersion,
    kind: obj.kind,
    name: obj.metadata.name,
    uid: obj.metadata.uid,
    controller: true,
    blockOwnerDeletion: true,
  }
}
