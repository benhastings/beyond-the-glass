import { applyObject, LAST_APPLIED } from '../commands/kubectl/manifests.ts'
import { kubectlYaml } from '../commands/kubectl/get.ts'
import { normalDiff } from '../commands/unified-diff.ts'
import type { Endpoints, Kind, Pod, ReplicaSet, Resource } from '../core/resources.ts'
import type { Simulator } from '../core/simulator.ts'
import { containerLogs } from '../telemetry/logs.ts'
import {
  application,
  deploymentHealth,
  desiredManifests,
  type Application,
  type HealthStatus,
  type SyncStatus,
  worst,
} from './argo.ts'

/**
 * What Argo CD's application page shows (E7-05): the resource tree (Application → Deployment →
 * ReplicaSet → Pods; Service → Endpoints) with health per node, and for any node its live and desired
 * manifests, the diff, its events and, for pods, the logs `kubectl logs` would print. Framework-free.
 */
export interface TreeNode {
  id: string
  kind: string
  name: string
  namespace: string
  health?: HealthStatus
  healthMessage?: string
  /** Only resources Git describes have a sync status. */
  sync?: SyncStatus
  children: TreeNode[]
}

export interface ResourceDiff {
  group: string
  kind: string
  name: string
  namespace: string
  live: string
  desired: string
  /** `diff`'s classic output; empty when they match. */
  diff: string
}

export const apiGroup = (kind: string) =>
  kind === 'Deployment' || kind === 'ReplicaSet' ? 'apps' : ''

/** A manifest as Argo shows it: no status, server-set metadata or last-applied record. */
export function cleanManifest(o: Resource | Endpoints | undefined): string {
  if (!o) return ''
  const rest: Record<string, unknown> & { metadata: Partial<Resource['metadata']> } = { ...o }
  delete rest.status
  const meta = { ...rest.metadata }
  for (const k of [
    'uid',
    'resourceVersion',
    'creationTimestamp',
    'generation',
    'managedFields',
  ] as const)
    Reflect.deleteProperty(meta, k)
  if (meta.annotations) {
    const annotations = Object.fromEntries(
      Object.entries(meta.annotations).filter(([k]) => k !== LAST_APPLIED),
    )
    if (Object.keys(annotations).length) meta.annotations = annotations
    else delete meta.annotations
  }
  return `${kubectlYaml({ ...rest, metadata: meta })}\n`
}

/** Live versus desired for every resource Git describes (what `argocd app diff` prints). */
export function resourceDiffs(
  sim: Simulator,
  app: Application,
  revision?: string,
): { error?: string; diffs: ResourceDiff[] } {
  const cluster = sim.clusterByName(app.destination.cluster)
  const d = desiredManifests(sim, app, revision)
  if (!cluster || d.error)
    return { error: d.error ?? `no cluster ${app.destination.cluster}`, diffs: [] }
  const diffs: ResourceDiff[] = []
  for (const doc of d.docs) {
    const res = applyObject(sim, cluster, doc, {
      source: app.name,
      namespace: app.destination.namespace,
      namespaceFlag: false,
      dryRun: true,
      verb: 'apply',
    })
    if (!res.ok) continue
    const live = cleanManifest(res.before)
    const desired = cleanManifest(res.after)
    diffs.push({
      group: apiGroup(res.kind),
      kind: res.kind,
      name: res.name,
      namespace: app.destination.namespace,
      live,
      desired,
      diff: res.action === 'unchanged' ? '' : normalDiff(live, desired),
    })
  }
  return { diffs }
}

const DEGRADED_WAITING = new Set([
  'CrashLoopBackOff',
  'ErrImagePull',
  'ImagePullBackOff',
  'CreateContainerConfigError',
  'InvalidImageName',
  'CreateContainerError',
])

/** Argo's pod health (gitops-engine pkg/health/health_pod.go, simplified to what the sim models). */
export function podHealth(p: Pod): { status: HealthStatus; message: string } {
  const waiting = p.status.containerStatuses
    ?.map((c) => c.state.waiting)
    .find((w) => w && DEGRADED_WAITING.has(w.reason))
  if (waiting) return { status: 'Degraded', message: waiting.message ?? waiting.reason }
  switch (p.status.phase) {
    case 'Succeeded':
      return { status: 'Healthy', message: '' }
    case 'Failed':
      return { status: 'Degraded', message: p.status.message ?? '' }
    case 'Running':
      return p.status.containerStatuses?.every((c) => c.ready)
        ? { status: 'Healthy', message: '' }
        : { status: 'Progressing', message: '' }
    default:
      return { status: 'Progressing', message: '' }
  }
}

/** Argo's ReplicaSet health: Progressing until the available replicas reach the desired count. */
export function replicaSetHealth(rs: ReplicaSet): { status: HealthStatus; message: string } {
  if ((rs.metadata.generation ?? 1) > (rs.status.observedGeneration ?? rs.metadata.generation ?? 1))
    return {
      status: 'Progressing',
      message:
        'Waiting for rollout to finish: observed replica set generation less than desired generation',
    }
  const available = rs.status.availableReplicas ?? 0
  if (available < rs.spec.replicas)
    return {
      status: 'Progressing',
      message: `Waiting for rollout to finish: ${String(available)} out of ${String(rs.spec.replicas)} new replicas are available...`,
    }
  return { status: 'Healthy', message: '' }
}

function healthOf(o: Resource): { status: HealthStatus; message: string } | undefined {
  switch (o.kind) {
    case 'Deployment':
      return deploymentHealth(o)
    case 'ReplicaSet':
      return replicaSetHealth(o)
    case 'Pod':
      return podHealth(o)
    case 'Service':
      return { status: 'Healthy', message: '' }
    default:
      return undefined
  }
}

const nodeId = (kind: string, namespace: string, name: string) => `${kind}/${namespace}/${name}`

/** The application's resource tree, live: what Git describes, and what the cluster made from it. */
export function resourceTree(sim: Simulator, appName: string): TreeNode | undefined {
  const app = application(sim, appName)
  const cluster = app && sim.clusterByName(app.destination.cluster)
  if (!app || !cluster) return undefined
  const ns = app.destination.namespace
  const c = cluster
  const node = (o: Resource | Endpoints, sync?: SyncStatus): TreeNode => {
    const h = o.kind === 'Endpoints' ? undefined : healthOf(o)
    return {
      id: nodeId(o.kind, ns, o.metadata.name),
      kind: o.kind,
      name: o.metadata.name,
      namespace: ns,
      ...(h ? { health: h.status, ...(h.message ? { healthMessage: h.message } : {}) } : {}),
      ...(sync ? { sync } : {}),
      children: o.kind === 'Endpoints' ? [] : children(o),
    }
  }
  const owned = <T extends ReplicaSet | Pod>(list: T[], owner: Resource) =>
    list
      .filter(
        (x) =>
          !x.metadata.deletionTimestamp &&
          x.metadata.ownerReferences?.some((r) => r.uid === owner.metadata.uid),
      )
      .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))
  function children(o: Resource): TreeNode[] {
    if (o.kind === 'Deployment')
      return owned(c.list('ReplicaSet', { namespace: ns }), o)
        .filter((rs) => rs.spec.replicas > 0 || rs.status.replicas > 0)
        .map((rs) => node(rs))
    if (o.kind === 'ReplicaSet')
      return owned(c.list('Pod', { namespace: ns }), o).map((p) => node(p))
    if (o.kind === 'Service') return [node(c.endpointsFor(o))]
    return []
  }
  const top: TreeNode[] = app.status.resources.map((r) => {
    const live = cluster.get(r.kind as Kind, ns, r.name)
    if (live) return node(live, r.status)
    return {
      id: nodeId(r.kind, ns, r.name),
      kind: r.kind,
      name: r.name,
      namespace: ns,
      health: 'Missing',
      sync: r.status,
      children: [],
    }
  })
  return {
    id: `Application/argocd/${app.name}`,
    kind: 'Application',
    name: app.name,
    namespace: 'argocd',
    // Argo watches its resources, so the app's health is live even between refreshes.
    health: app.status.conditions.length
      ? app.status.health
      : worst(top.flatMap((n) => (n.health ? [n.health] : []))),
    sync: app.status.sync,
    children: top.sort((a, b) =>
      a.kind === b.kind ? (a.name < b.name ? -1 : 1) : a.kind < b.kind ? -1 : 1,
    ),
  }
}

export interface EventRow {
  type: string
  reason: string
  /** Sim time of the latest occurrence. */
  at: number
  count: number
  message: string
}

export interface NodeDetails {
  live: string
  desired?: string
  diff?: string
  events: EventRow[]
  /** Pods only: the first container's logs, exactly as `kubectl logs` prints them, or its error. */
  logs?: { ok: true; lines: string[] } | { ok: false; error: string }
}

/** What clicking a node shows. */
export function nodeDetails(
  sim: Simulator,
  appName: string,
  node: Pick<TreeNode, 'kind' | 'name' | 'namespace'>,
): NodeDetails | undefined {
  const app = application(sim, appName)
  const cluster = app && sim.clusterByName(app.destination.cluster)
  if (!app || !cluster) return undefined
  const eventsFor = (kind: string, namespace: string, name: string): EventRow[] =>
    cluster
      .list('Event', { namespace })
      .filter((e) => e.involvedObject.kind === kind && e.involvedObject.name === name)
      .map((e) => ({
        type: e.type,
        reason: e.reason,
        at: Date.parse(e.lastTimestamp) - sim.clock.epochMs,
        count: e.count,
        message: e.message,
      }))
      .sort((a, b) => a.at - b.at)
  if (node.kind === 'Application')
    return {
      live: kubectlYaml({
        apiVersion: 'argoproj.io/v1alpha1',
        kind: 'Application',
        metadata: { name: app.name, namespace: 'argocd' },
        spec: {
          source: app.source,
          destination: app.destination,
          ...(app.syncPolicy ? { syncPolicy: app.syncPolicy } : {}),
        },
      }),
      // Argo's own record: sync status changes, and each sync it started and finished.
      events: eventsFor('Application', 'argocd', app.name),
    }
  if (node.kind === 'Endpoints') {
    const svc = cluster.get('Service', node.namespace, node.name)
    return { live: svc ? cleanManifest(cluster.endpointsFor(svc)) : '', events: [] }
  }
  const live = cluster.get(node.kind as Kind, node.namespace, node.name)
  const d = resourceDiffs(sim, app).diffs.find((x) => x.kind === node.kind && x.name === node.name)
  const events = eventsFor(node.kind, node.namespace, node.name)
  const pod = live?.kind === 'Pod' ? live : undefined
  const logs = pod && containerLogs(sim, pod, pod.spec.containers[0]?.name ?? '')
  return {
    live: live ? cleanManifest(live) : '',
    ...(d ? { desired: d.desired, diff: d.diff } : {}),
    events,
    ...(logs
      ? { logs: logs.ok ? { ok: true as const, lines: logs.lines.map((l) => l.text) } : logs }
      : {}),
  }
}
