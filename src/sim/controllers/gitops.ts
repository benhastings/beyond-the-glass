import { recordMutation } from '../core/audit.ts'
import type { Cluster } from '../core/cluster.ts'
import type { KindMap } from '../core/resources.ts'
import type { Controller, Simulator } from '../core/simulator.ts'

/**
 * The hook Argo CD's simulation (E7-06) builds on: a namespace whose desired state lives "in Git".
 * With self-heal on, every sync tick puts drifted objects back the way Git has them, so a learner's
 * `kubectl scale` succeeds and is then quietly reverted, as on a real GitOps-managed cluster.
 */
export interface ManagedNamespace {
  cluster: string
  namespace: string
  /** The Argo CD Application's name. */
  app: string
  selfHeal: boolean
  /** Time between sync ticks (Argo CD's reconciliation period; default 3 minutes). */
  intervalMs?: number
}

/** The kinds Git describes; pods, ReplicaSets and events belong to controllers. */
export const MANAGED_KINDS = ['Deployment', 'Service', 'ConfigMap', 'Secret'] as const
type ManagedKind = (typeof MANAGED_KINDS)[number]

interface Desired {
  kind: ManagedKind
  name: string
  labels: Record<string, string>
  annotations: Record<string, string>
  body: Record<string, unknown>
}

interface GitopsState extends Record<string, unknown> {
  managed: (ManagedNamespace & { desired: Desired[] })[]
}

export const DEFAULT_SYNC_MS = 180_000
const NAME = 'gitops'
/** Annotations controllers set, which Git never holds. */
const CONTROLLER_OWNED = /^deployment\.kubernetes\.io\//

const gstate = (sim: Simulator) => sim.state<GitopsState>(NAME, () => ({ managed: [] }))

/** The parts of an object Git declares: spec (or data), labels and annotations. */
function desiredOf(kind: ManagedKind, obj: KindMap[ManagedKind]): Desired {
  const body: Record<string, unknown> = {}
  for (const k of ['spec', 'data', 'type'] as const)
    if (k in obj) body[k] = structuredClone((obj as unknown as Record<string, unknown>)[k])
  const annotations = Object.fromEntries(
    Object.entries(obj.metadata.annotations ?? {}).filter(([k]) => !CONTROLLER_OWNED.test(k)),
  )
  return { kind, name: obj.metadata.name, labels: { ...obj.metadata.labels }, annotations, body }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Declares a namespace GitOps-managed, taking what's there now as Git's desired state. */
export function manageNamespace(sim: Simulator, m: ManagedNamespace): void {
  const cluster = sim.clusterByName(m.cluster)
  if (!cluster) throw new Error(`no cluster "${m.cluster}"`)
  const desired = MANAGED_KINDS.flatMap((kind) =>
    cluster
      .list<ManagedKind>(kind, { namespace: m.namespace })
      .map((o: KindMap[ManagedKind]) => desiredOf(kind, o)),
  )
  const st = gstate(sim)
  st.managed = st.managed.filter((x) => !(x.cluster === m.cluster && x.namespace === m.namespace))
  st.managed.push({ ...structuredClone(m), desired })
  sim.schedule(sim.now + (m.intervalMs ?? DEFAULT_SYNC_MS), NAME, {
    cluster: m.cluster,
    namespace: m.namespace,
  })
}

/** The Argo CD application managing a namespace, if any. */
export function managedBy(
  sim: Simulator,
  cluster: string,
  namespace: string,
): ManagedNamespace | undefined {
  const m = gstate(sim).managed.find((x) => x.cluster === cluster && x.namespace === namespace)
  if (!m) return undefined
  return {
    cluster: m.cluster,
    namespace: m.namespace,
    app: m.app,
    selfHeal: m.selfHeal,
    ...(m.intervalMs !== undefined ? { intervalMs: m.intervalMs } : {}),
  }
}

/** Puts every drifted or deleted object back as Git has it. Returns what it changed. */
export function selfHeal(
  sim: Simulator,
  cluster: Cluster,
  m: GitopsState['managed'][number],
): string[] {
  const changed: string[] = []
  for (const d of m.desired) {
    const live: KindMap[ManagedKind] | undefined = cluster.get<ManagedKind>(
      d.kind,
      m.namespace,
      d.name,
    )
    const liveAnn = Object.fromEntries(
      Object.entries(live?.metadata.annotations ?? {}).filter(([k]) => !CONTROLLER_OWNED.test(k)),
    )
    const liveBody = live ? desiredOf(d.kind, live).body : undefined
    if (
      live &&
      same(live.metadata.labels ?? {}, d.labels) &&
      same(liveAnn, d.annotations) &&
      same(liveBody, d.body)
    )
      continue
    const kept = Object.fromEntries(
      Object.entries(live?.metadata.annotations ?? {}).filter(([k]) => CONTROLLER_OWNED.test(k)),
    )
    const obj = (live ?? {
      apiVersion: d.kind === 'Deployment' ? 'apps/v1' : 'v1',
      kind: d.kind,
      metadata: {
        name: d.name,
        namespace: m.namespace,
        uid: '',
        resourceVersion: '',
        creationTimestamp: '',
      },
      ...(d.kind === 'Deployment' ? { status: {} } : {}),
    }) as unknown as Record<string, unknown> & { metadata: KindMap[ManagedKind]['metadata'] }
    Object.assign(obj, structuredClone(d.body))
    obj.metadata.labels = { ...d.labels }
    obj.metadata.annotations = { ...kept, ...d.annotations }
    if (d.kind === 'Deployment') obj.metadata.generation = (obj.metadata.generation ?? 0) + 1
    cluster.put(obj as unknown as KindMap[ManagedKind])
    recordMutation(sim, {
      actor: 'argocd',
      cluster: cluster.name,
      verb: 'sync',
      kind: d.kind,
      namespace: m.namespace,
      name: d.name,
      detail: { app: m.app, reason: live ? 'drift' : 'missing' },
    })
    changed.push(`${d.kind}/${d.name}`)
  }
  return changed
}

export const gitopsController: Controller = {
  name: NAME,
  reconcile: () => undefined,
  wake: (sim, payload) => {
    const p = payload as { cluster: string; namespace: string }
    const m = gstate(sim).managed.find(
      (x) => x.cluster === p.cluster && x.namespace === p.namespace,
    )
    const cluster = sim.clusterByName(p.cluster)
    if (!m || !cluster) return
    if (m.selfHeal) selfHeal(sim, cluster, m)
    sim.schedule(sim.now + (m.intervalMs ?? DEFAULT_SYNC_MS), NAME, p)
  },
}
