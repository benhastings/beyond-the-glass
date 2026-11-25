import { applyObject, parseManifests } from '../commands/kubectl/manifests.ts'
import { recordMutation } from '../core/audit.ts'
import type { Cluster } from '../core/cluster.ts'
import type { Deployment, Kind, Resource } from '../core/resources.ts'
import type { Controller, Simulator } from '../core/simulator.ts'
import { parseDuration } from '../core/duration.ts'
import { createRepo, repo, resolve } from './git.ts'

/**
 * Argo CD's Application model (E7-01): where the desired state lives in Git, where it goes, how it syncs,
 * and what Argo would show: sync status, health from the live resources, operation state, history and
 * the resource tree. A reconcile loop on the sim clock syncs automated apps.
 */
export type SyncStatus = 'Synced' | 'OutOfSync' | 'Unknown'
export type HealthStatus =
  'Healthy' | 'Progressing' | 'Degraded' | 'Suspended' | 'Missing' | 'Unknown'

export interface ApplicationSpec {
  name: string
  project?: string
  source: { repo: string; path: string; targetRevision: string }
  destination: { cluster: string; namespace: string }
  syncPolicy?: { automated?: { prune?: boolean; selfHeal?: boolean } }
}

export interface ResourceStatus {
  kind: string
  name: string
  namespace: string
  status: SyncStatus
  health?: HealthStatus
  healthMessage?: string
}

export interface Application extends ApplicationSpec {
  status: {
    sync: SyncStatus
    /** The commit the target revision resolves to now. */
    revision: string
    health: HealthStatus
    resources: ResourceStatus[]
    operationState?: {
      phase: 'Succeeded' | 'Failed'
      message: string
      revision: string
      startedAt: number
      finishedAt: number
    }
    history: { id: number; revision: string; deployedAt: number }[]
    /** Why the comparison failed, if it did (bad YAML, a path with no manifests). */
    conditions: string[]
    reconciledAt: number
  }
}

interface ArgoState extends Record<string, unknown> {
  apps: Application[]
  intervalMs: number
}

export const ARGO_NAME = 'argocd'
export const DEFAULT_RECONCILE_MS = 180_000
/** Argo's default tracking label: it marks what each application manages, for pruning. */
export const INSTANCE_LABEL = 'app.kubernetes.io/instance'
const HEALTH_ORDER: HealthStatus[] = [
  'Healthy',
  'Suspended',
  'Progressing',
  'Missing',
  'Degraded',
  'Unknown',
]

const state = (sim: Simulator) =>
  sim.state<ArgoState>(ARGO_NAME, () => ({ apps: [], intervalMs: DEFAULT_RECONCILE_MS }))

export const applications = (sim: Simulator): Application[] => state(sim).apps
export const application = (sim: Simulator, name: string) =>
  state(sim).apps.find((a) => a.name === name)

/** Argo CD's health rules for a Deployment (argo-cd/gitops-engine pkg/health/health_deployment.go). */
export function deploymentHealth(d: Deployment): { status: HealthStatus; message: string } {
  if (d.spec.paused) return { status: 'Suspended', message: 'Deployment is paused' }
  const st = d.status
  if ((d.metadata.generation ?? 1) > (st.observedGeneration ?? 0))
    return {
      status: 'Progressing',
      message:
        'Waiting for rollout to finish: observed deployment generation less than desired generation',
    }
  const progressing = st.conditions?.find((c) => c.type === 'Progressing')
  if (progressing?.reason === 'ProgressDeadlineExceeded')
    return {
      status: 'Degraded',
      message: `Deployment "${d.metadata.name}" exceeded its progress deadline`,
    }
  const updated = st.updatedReplicas ?? 0
  if (updated < d.spec.replicas)
    return {
      status: 'Progressing',
      message: `Waiting for rollout to finish: ${String(updated)} out of ${String(d.spec.replicas)} new replicas have been updated...`,
    }
  if ((st.replicas ?? 0) > updated)
    return {
      status: 'Progressing',
      message: `Waiting for rollout to finish: ${String((st.replicas ?? 0) - updated)} old replicas are pending termination...`,
    }
  if ((st.availableReplicas ?? 0) < updated)
    return {
      status: 'Progressing',
      message: `Waiting for rollout to finish: ${String(st.availableReplicas ?? 0)} of ${String(updated)} updated replicas are available...`,
    }
  return { status: 'Healthy', message: '' }
}

function resourceHealth(
  obj: Resource | undefined,
): { status: HealthStatus; message: string } | undefined {
  if (!obj) return { status: 'Missing', message: '' }
  if (obj.kind === 'Deployment') return deploymentHealth(obj)
  if (obj.kind === 'Service') return { status: 'Healthy', message: '' }
  return undefined
}

/** The worst of several health statuses (an application's health is its worst resource's). */
export const worst = (hs: HealthStatus[]): HealthStatus =>
  hs.reduce<HealthStatus>(
    (a, b) => (HEALTH_ORDER.indexOf(b) > HEALTH_ORDER.indexOf(a) ? b : a),
    'Healthy',
  )

/** The manifests an application's source points at, as objects, with Argo's tracking label added. */
/** The objects an application's source describes, with Argo's tracking label (what `diff` compares). */
export function desiredManifests(
  sim: Simulator,
  app: ApplicationSpec,
  revision = app.source.targetRevision,
): { docs: Record<string, unknown>[]; revision: string; error?: string } {
  const r = repo(sim, app.source.repo)
  const c = r && resolve(r, revision)
  if (!r || !c)
    return {
      docs: [],
      revision: '',
      error: `unable to resolve '${revision}' to a commit SHA in ${app.source.repo}`,
    }
  const dir = app.source.path.replace(/^\.?\/?/, '').replace(/\/$/, '')
  const files = Object.entries(c.files)
    .filter(([p]) => (dir ? p.startsWith(`${dir}/`) : true) && /\.(ya?ml|json)$/.test(p))
    .sort(([a], [b]) => (a < b ? -1 : 1))
  if (!files.length)
    return {
      docs: [],
      revision: c.sha,
      error: `${app.source.path}: app path does not exist or has no manifests`,
    }
  const docs: Record<string, unknown>[] = []
  for (const [p, text] of files) {
    const parsed = parseManifests(text)
    if (!parsed.ok) return { docs: [], revision: c.sha, error: `${p}: ${parsed.error}` }
    for (const d of parsed.docs) {
      if (typeof d !== 'object' || d === null) continue
      const o = structuredClone(d) as Record<string, unknown> & {
        metadata?: { labels?: Record<string, string> }
      }
      o.metadata = { ...o.metadata, labels: { ...o.metadata?.labels, [INSTANCE_LABEL]: app.name } }
      docs.push(o)
    }
  }
  return { docs, revision: c.sha }
}

const nameOf = (d: Record<string, unknown>): string => {
  const n = (d.metadata as { name?: unknown } | undefined)?.name
  return typeof n === 'string' ? n : ''
}

/** Compares Git with the live cluster and updates the application's status (Argo's "refresh"). */
export function refresh(sim: Simulator, name: string): Application | undefined {
  const app = application(sim, name)
  const cluster = app && sim.clusterByName(app.destination.cluster)
  if (!app || !cluster) return app
  const d = desiredManifests(sim, app)
  app.status.revision = d.revision
  app.status.conditions = d.error ? [d.error] : []
  app.status.reconciledAt = sim.now
  if (d.error) {
    app.status.sync = 'Unknown'
    app.status.health = 'Unknown'
    return app
  }
  const resources: ResourceStatus[] = d.docs.map((doc) => {
    const kind = String(doc.kind)
    const r = applyObject(sim, cluster, doc, {
      source: name,
      namespace: app.destination.namespace,
      namespaceFlag: false,
      dryRun: true,
      verb: 'apply',
    })
    const live = cluster.get(
      kind as Kind,
      kind === 'Namespace' ? undefined : app.destination.namespace,
      nameOf(doc),
    )
    const h = resourceHealth(live)
    return {
      kind,
      name: nameOf(doc),
      namespace: app.destination.namespace,
      status: r.ok && r.action === 'unchanged' ? 'Synced' : 'OutOfSync',
      ...(h ? { health: h.status, ...(h.message ? { healthMessage: h.message } : {}) } : {}),
    }
  })
  // Live objects the app manages that Git no longer has: out of sync until pruned.
  for (const extra of tracked(cluster, app).filter(
    (o) => !resources.some((r) => r.kind === o.kind && r.name === o.metadata.name),
  ))
    resources.push({
      kind: extra.kind,
      name: extra.metadata.name,
      namespace: app.destination.namespace,
      status: 'OutOfSync',
    })
  app.status.resources = resources
  app.status.sync = resources.every((r) => r.status === 'Synced') ? 'Synced' : 'OutOfSync'
  app.status.health = worst(
    resources.map((r) => r.health).filter((h): h is HealthStatus => h !== undefined),
  )
  return app
}

function tracked(cluster: Cluster, app: ApplicationSpec): Resource[] {
  return (['Deployment', 'Service', 'ConfigMap', 'Secret'] as const).flatMap(
    (k) =>
      cluster
        .list(k, { namespace: app.destination.namespace })
        .filter((o) => o.metadata.labels?.[INSTANCE_LABEL] === app.name) as Resource[],
  )
}

/** Syncs an application: applies Git's manifests (and prunes, if asked), then records the operation. */
/** `revision` syncs an older commit instead of the target (Argo's rollback). */
export function sync(
  sim: Simulator,
  name: string,
  opts: { prune?: boolean; revision?: string } = {},
): Application | undefined {
  const app = application(sim, name)
  const cluster = app && sim.clusterByName(app.destination.cluster)
  if (!app || !cluster) return app
  const started = sim.now
  const d = desiredManifests(sim, app, opts.revision)
  const fail = (message: string) => {
    app.status.operationState = {
      phase: 'Failed',
      message,
      revision: d.revision,
      startedAt: started,
      finishedAt: sim.now,
    }
    return refresh(sim, name)
  }
  if (d.error) return fail(d.error)
  const errors: string[] = []
  for (const doc of d.docs) {
    const r = applyObject(sim, cluster, doc, {
      source: name,
      namespace: app.destination.namespace,
      namespaceFlag: false,
      dryRun: false,
      verb: 'apply',
    })
    if (!r.ok) errors.push(`${String(doc.kind)}/${nameOf(doc)}: ${r.error}`)
    else if (r.action !== 'unchanged')
      recordMutation(sim, {
        actor: 'argocd',
        cluster: cluster.name,
        verb: 'sync',
        kind: r.kind,
        namespace: app.destination.namespace,
        name: r.name,
        detail: { app: name, revision: d.revision, action: r.action },
      })
  }
  if (opts.prune ?? app.syncPolicy?.automated?.prune) {
    for (const extra of tracked(cluster, app).filter(
      (o) => !d.docs.some((doc) => doc.kind === o.kind && nameOf(doc) === o.metadata.name),
    )) {
      cluster.delete(extra.kind, app.destination.namespace, extra.metadata.name)
      recordMutation(sim, {
        actor: 'argocd',
        cluster: cluster.name,
        verb: 'prune',
        kind: extra.kind,
        namespace: app.destination.namespace,
        name: extra.metadata.name,
        detail: { app: name },
      })
    }
  }
  sim.reconcile()
  if (errors.length) return fail(`one or more objects failed to apply: ${errors.join('; ')}`)
  app.status.operationState = {
    phase: 'Succeeded',
    message: 'successfully synced (all tasks run)',
    revision: d.revision,
    startedAt: started,
    finishedAt: sim.now,
  }
  app.status.history.push({
    id: app.status.history.length,
    revision: d.revision,
    deployedAt: sim.now,
  })
  return refresh(sim, name)
}

/** Adds an application (as `argocd app create` or a scenario does) and computes its first status. */
export function createApplication(sim: Simulator, spec: ApplicationSpec): Application {
  const st = state(sim)
  const app: Application = {
    ...structuredClone(spec),
    status: {
      sync: 'Unknown',
      revision: '',
      health: 'Unknown',
      resources: [],
      history: [],
      conditions: [],
      reconciledAt: sim.now,
    },
  }
  st.apps = [...st.apps.filter((a) => a.name !== spec.name), app]
  refresh(sim, spec.name)
  return app
}

export function setReconcileInterval(sim: Simulator, ms: number): void {
  state(sim).intervalMs = ms
}

/** One reconcile tick: refresh every app; auto-sync the automated ones that need it. */
export function reconcileApps(sim: Simulator): void {
  for (const app of state(sim).apps) {
    refresh(sim, app.name)
    const auto = app.syncPolicy?.automated
    if (!auto || app.status.sync !== 'OutOfSync') continue
    const lastSynced = app.status.history.at(-1)?.revision
    // Without self-heal, an automated app syncs each new revision once, and leaves drift alone after.
    if (app.status.revision !== lastSynced || auto.selfHeal) sync(sim, app.name)
  }
}

/** The reconcile loop: a wakeup every interval (Argo's timeout.reconciliation, 3 minutes by default). */
export const argoController: Controller = {
  name: ARGO_NAME,
  reconcile: (sim) => {
    const st = state(sim)
    if (st.started === true) return
    st.started = true
    // The scenario's repos and applications, once, when the simulation starts.
    const g = sim.scenario.gitops
    if (g) {
      st.intervalMs = parseDuration(g.reconcileInterval)
      for (const [name, r] of Object.entries(g.repos))
        if (!repo(sim, name)) createRepo(sim, name, r.files, { branch: r.branch })
      for (const a of g.applications) createApplication(sim, a)
    }
    sim.schedule(sim.now + st.intervalMs, ARGO_NAME)
  },
  wake: (sim) => {
    reconcileApps(sim)
    sim.schedule(sim.now + state(sim).intervalMs, ARGO_NAME)
  },
}

export interface SyncPreviewRow {
  kind: string
  name: string
  action: 'created' | 'configured' | 'unchanged' | 'pruned' | 'failed'
  message?: string
}

/** A dry-run sync (Argo's "Dry run" option): what a sync would do, without changing anything. */
export function syncPreview(
  sim: Simulator,
  name: string,
  opts: { prune?: boolean } = {},
): { error?: string; rows: SyncPreviewRow[] } {
  const app = application(sim, name)
  const cluster = app && sim.clusterByName(app.destination.cluster)
  if (!app || !cluster) return { error: `application ${name} not found`, rows: [] }
  const d = desiredManifests(sim, app)
  if (d.error) return { error: d.error, rows: [] }
  const rows: SyncPreviewRow[] = d.docs.map((doc) => {
    const r = applyObject(sim, cluster, doc, {
      source: name,
      namespace: app.destination.namespace,
      namespaceFlag: false,
      dryRun: true,
      verb: 'apply',
    })
    return r.ok
      ? { kind: r.kind, name: r.name, action: r.action }
      : { kind: String(doc.kind), name: nameOf(doc), action: 'failed', message: r.error }
  })
  const extra = tracked(cluster, app).filter(
    (o) => !d.docs.some((doc) => doc.kind === o.kind && nameOf(doc) === o.metadata.name),
  )
  for (const o of extra)
    rows.push(
      opts.prune
        ? { kind: o.kind, name: o.metadata.name, action: 'pruned' }
        : {
            kind: o.kind,
            name: o.metadata.name,
            action: 'unchanged',
            message: 'ignored (requires pruning)',
          },
    )
  return { rows }
}
