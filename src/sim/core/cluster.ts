import type { SimClock } from './clock.ts'
import { uid } from './names.ts'
import type { Rng } from './rng.ts'
import {
  CLUSTER_SCOPED,
  KINDS,
  type EndpointAddress,
  type Endpoints,
  type Event,
  type Kind,
  type KindMap,
  type LabelSelector,
  type ObjectReference,
  type Pod,
  type Service,
} from './resources.ts'
import { matchesMap, matchesSelector } from './selectors.ts'

type Store = { [K in Kind]: Record<string, KindMap[K]> }

/** JSON-serializable state of one cluster. */
export interface ClusterData {
  name: string
  server: string
  resourceVersion: number
  eventSeq: number
  store: Store
}

function emptyStore(): Store {
  return Object.fromEntries(KINDS.map((k) => [k, {}])) as unknown as Store
}

function keyOf(kind: Kind, namespace: string | undefined, name: string): string {
  return CLUSTER_SCOPED.has(kind) ? name : `${namespace ?? 'default'}/${name}`
}

export interface ListOptions {
  namespace?: string
  selector?: LabelSelector
}

/**
 * One simulated cluster's objects. Reads return the stored objects; callers that change one must `put` it
 * back so its resourceVersion moves on. Lists are ordered by namespace and name, like the API server.
 */
export class Cluster {
  readonly name: string
  readonly server: string
  private data: ClusterData
  private readonly clock: SimClock
  private readonly rng: Rng

  constructor(data: ClusterData, clock: SimClock, rng: Rng) {
    this.name = data.name
    this.server = data.server
    this.data = data
    this.clock = clock
    this.rng = rng
  }

  static create(name: string, server: string, clock: SimClock, rng: Rng): Cluster {
    return new Cluster(
      { name, server, resourceVersion: 1000, eventSeq: 0, store: emptyStore() },
      clock,
      rng,
    )
  }

  /** A deep copy of the cluster's state. */
  toJSON(): ClusterData {
    return structuredClone(this.data)
  }

  private bucket<K extends Kind>(kind: K): Record<string, KindMap[K]> {
    return this.data.store[kind]
  }

  get<K extends Kind>(
    kind: K,
    namespace: string | undefined,
    name: string,
  ): KindMap[K] | undefined {
    return this.bucket(kind)[keyOf(kind, namespace, name)]
  }

  list<K extends Kind>(kind: K, opts: ListOptions = {}): KindMap[K][] {
    const items = Object.entries(this.bucket(kind))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, v]) => v)
    return items.filter(
      (o) =>
        (opts.namespace === undefined ||
          CLUSTER_SCOPED.has(kind) ||
          o.metadata.namespace === opts.namespace) &&
        (opts.selector === undefined || matchesSelector(o.metadata.labels, opts.selector)),
    )
  }

  /** Stores an object (create or replace), bumping its resourceVersion. Fills uid and creationTimestamp if missing. */
  put<K extends Kind>(obj: KindMap[K]): KindMap[K] {
    const kind = obj.kind as K
    const m = obj.metadata
    if (!CLUSTER_SCOPED.has(kind)) m.namespace ??= 'default'
    if (!m.uid) m.uid = uid(this.rng)
    if (!m.creationTimestamp) m.creationTimestamp = this.clock.iso()
    m.resourceVersion = String(++this.data.resourceVersion)
    this.bucket(kind)[keyOf(kind, m.namespace, m.name)] = obj
    return obj
  }

  delete(kind: Kind, namespace: string | undefined, name: string): boolean {
    const key = keyOf(kind, namespace, name)
    const bucket = this.bucket(kind)
    if (!Object.hasOwn(bucket, key)) return false
    // Deletes move the version on too, as in the API server, so the version names one state of the cluster.
    this.data.resourceVersion++
    return Reflect.deleteProperty(bucket, key)
  }

  /** The cluster's latest resourceVersion: it changes whenever any object is stored or deleted. */
  get revision(): number {
    return this.data.resourceVersion
  }

  /** Namespaces that exist. */
  namespaces(): string[] {
    return this.list('Namespace').map((n) => n.metadata.name)
  }

  /**
   * Records an Event. A repeat of the same reason and message for the same object is folded into the
   * existing Event (count + 1, lastTimestamp = now), the way the event recorder aggregates.
   */
  recordEvent(
    involved: ObjectReference,
    type: Event['type'],
    reason: string,
    message: string,
    source: Event['source'],
    /** For history written at scenario start: when it began, when it last happened, how often. */
    history?: { first: string; last: string; count: number },
  ): Event {
    const now = history?.last ?? this.clock.iso()
    const ns = involved.namespace ?? 'default'
    const existing = this.list('Event', { namespace: ns }).find(
      (e) =>
        e.involvedObject.uid === involved.uid &&
        e.involvedObject.name === involved.name &&
        e.reason === reason &&
        e.message === message,
    )
    if (existing) {
      existing.count += 1
      existing.lastTimestamp = now
      return this.put<'Event'>(existing)
    }
    // Real event names are `<object>.<hex of the creation time in ns>`; a sequence keeps them unique.
    const nanos =
      BigInt(this.clock.epochMs + this.clock.now) * 1_000_000n + BigInt(++this.data.eventSeq)
    return this.put<'Event'>({
      apiVersion: 'v1',
      kind: 'Event',
      metadata: {
        name: `${involved.name}.${nanos.toString(16)}`,
        namespace: ns,
        uid: '',
        resourceVersion: '',
        creationTimestamp: now,
      },
      involvedObject: involved,
      reason,
      message,
      type,
      count: history?.count ?? 1,
      firstTimestamp: history?.first ?? now,
      lastTimestamp: now,
      source,
      reportingComponent: source.component,
    })
  }

  /** The Endpoints view of a Service: Ready matching pods as addresses, the rest as notReadyAddresses. */
  endpointsFor(svc: Service): Endpoints {
    const ns = svc.metadata.namespace ?? 'default'
    const pods = this.list('Pod', { namespace: ns }).filter(
      (p) =>
        matchesMap(p.metadata.labels, svc.spec.selector) &&
        p.status.podIP &&
        !p.metadata.deletionTimestamp,
    )
    const addr = (p: Pod): EndpointAddress => ({
      ip: p.status.podIP ?? '',
      ...(p.spec.nodeName ? { nodeName: p.spec.nodeName } : {}),
      targetRef: { kind: 'Pod', name: p.metadata.name, namespace: ns, uid: p.metadata.uid },
    })
    const ready = pods.filter(isPodReady).map(addr)
    const notReady = pods.filter((p) => !isPodReady(p)).map(addr)
    const ports = svc.spec.ports.map((p) => ({
      ...(p.name ? { name: p.name } : {}),
      // A named targetPort resolves through the pods' container ports, as the endpoints controller does.
      port:
        typeof p.targetPort === 'number'
          ? p.targetPort
          : (pods
              .flatMap((pod) => pod.spec.containers.flatMap((c) => c.ports ?? []))
              .find((cp) => cp.name === p.targetPort)?.containerPort ?? p.port),
      protocol: p.protocol,
    }))
    return {
      apiVersion: 'v1',
      kind: 'Endpoints',
      metadata: {
        name: svc.metadata.name,
        namespace: ns,
        creationTimestamp: svc.metadata.creationTimestamp,
        ...(svc.metadata.labels ? { labels: svc.metadata.labels } : {}),
      },
      subsets:
        ready.length + notReady.length === 0
          ? []
          : [
              {
                ...(ready.length ? { addresses: ready } : {}),
                ...(notReady.length ? { notReadyAddresses: notReady } : {}),
                ports,
              },
            ],
    }
  }
}

export function isPodReady(p: Pod): boolean {
  return p.status.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ?? false
}
