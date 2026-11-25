import { z } from 'zod'
import { Cluster, type ClusterData } from './cluster.ts'
import { SimClock } from './clock.ts'
import { parseDuration } from './duration.ts'
import { materialize } from './materialize.ts'
import { Rng } from './rng.ts'
import type { Scenario } from './scenario.ts'
import { timelineEvent, timelineParams } from './timeline/index.ts'

/**
 * Something that reacts to cluster state: the Deployment controller, the kubelet, Argo CD's sync loop.
 * `reconcile` runs after every timeline event, wakeup and command; `wake` receives the wakeups the
 * controller scheduled for itself (a backoff expiring, a probe period elapsing).
 */
export interface Controller {
  name: string
  reconcile: (sim: Simulator) => void
  wake?: (sim: Simulator, payload: unknown) => void
}

export type Wakeup =
  | { at: number; seq: number; kind: 'timeline'; index: number }
  | { at: number; seq: number; kind: 'controller'; controller: string; payload?: unknown }

export interface Traffic {
  rps?: number
  latencyMs?: number
}

export const SNAPSHOT_VERSION = 1

/** Everything needed to continue a simulation exactly where it stopped. Plain JSON. */
export interface SimSnapshot {
  version: typeof SNAPSHOT_VERSION
  scenarioId: string
  now: number
  rng: number
  seq: number
  currentContext: string
  clusters: ClusterData[]
  traffic: Record<string, Traffic>
  queue: Wakeup[]
  /** Controllers' own state (backoff timers, behaviours); see `Simulator.state`. */
  ext?: Record<string, Record<string, unknown>>
}

const snapshotShape = z.looseObject({
  version: z.literal(SNAPSHOT_VERSION),
  scenarioId: z.string(),
  now: z.number().nonnegative(),
  rng: z.number().int(),
  seq: z.number().int(),
  currentContext: z.string(),
  clusters: z.array(
    z.looseObject({
      name: z.string(),
      server: z.string(),
      store: z.record(z.string(), z.unknown()),
    }),
  ),
  traffic: z.record(z.string(), z.looseObject({})),
  queue: z.array(
    z.looseObject({ at: z.number(), seq: z.number(), kind: z.enum(['timeline', 'controller']) }),
  ),
})

export interface SimOptions {
  controllers?: Controller[]
  /** Overrides the scenario's seed (tests use this to vary runs). */
  seed?: number | string
}

/**
 * The simulation of one scenario: its clusters, a simulated clock and a seeded RNG, driven by the
 * scenario timeline and by registered controllers. Deterministic: same scenario, seed and calls,
 * same state.
 */
export class Simulator {
  readonly scenario: Scenario
  readonly clock: SimClock
  readonly rng: Rng
  private readonly clusterMap: Map<string, Cluster>
  private readonly controllers: Controller[]
  private queue: Wakeup[]
  private seq: number
  private trafficState: Record<string, Traffic>
  private extState: Record<string, Record<string, unknown>>
  private ctx: string

  private constructor(scenario: Scenario, clock: SimClock, rng: Rng, controllers: Controller[]) {
    this.scenario = scenario
    this.clock = clock
    this.rng = rng
    this.controllers = controllers
    this.clusterMap = new Map()
    this.queue = []
    this.seq = 0
    this.trafficState = {}
    this.extState = {}
    this.ctx = scenario.currentContext
  }

  /** Builds the scenario's starting state and applies any timeline events at `+0s`. */
  static load(scenario: Scenario, opts: SimOptions = {}): Simulator {
    const sim = new Simulator(
      scenario,
      new SimClock(scenario.startTime),
      new Rng(opts.seed ?? scenario.seed),
      opts.controllers ?? [],
    )
    for (const c of scenario.clusters) {
      const cluster = Cluster.create(c.name, c.server, sim.clock, sim.rng)
      materialize(cluster, c, sim.clock, sim.rng)
      sim.clusterMap.set(c.name, cluster)
    }
    scenario.timeline.forEach((e, index) => {
      sim.push({ at: parseDuration(e.at), seq: 0, kind: 'timeline', index })
    })
    sim.reconcile()
    sim.advanceTo(0)
    return sim
  }

  /** Continues from a snapshot taken from a simulation of the same scenario. */
  static restore(
    scenario: Scenario,
    snapshot: unknown,
    opts: Omit<SimOptions, 'seed'> = {},
  ): Simulator {
    const parsed = snapshotShape.safeParse(snapshot)
    if (!parsed.success)
      throw new TypeError(`not a simulator snapshot: ${parsed.error.issues[0]?.message ?? ''}`)
    const s = structuredClone(snapshot) as SimSnapshot
    if (s.scenarioId !== scenario.id)
      throw new TypeError(`snapshot is for scenario "${s.scenarioId}", not "${scenario.id}"`)
    const sim = new Simulator(
      scenario,
      new SimClock(scenario.startTime, s.now),
      Rng.fromState(s.rng),
      opts.controllers ?? [],
    )
    for (const data of s.clusters)
      sim.clusterMap.set(data.name, new Cluster(data, sim.clock, sim.rng))
    sim.queue = s.queue
    sim.seq = s.seq
    sim.trafficState = s.traffic
    sim.extState = s.ext ?? {}
    sim.ctx = s.currentContext
    return sim
  }

  snapshot(): SimSnapshot {
    return structuredClone({
      version: SNAPSHOT_VERSION,
      scenarioId: this.scenario.id,
      now: this.clock.now,
      rng: this.rng.state,
      seq: this.seq,
      currentContext: this.ctx,
      clusters: [...this.clusterMap.values()].map((c) => c.toJSON()),
      traffic: this.trafficState,
      ext: this.extState,
      queue: this.queue,
    })
  }

  get now(): number {
    return this.clock.now
  }

  get currentContext(): string {
    return this.ctx
  }

  get contexts(): Scenario['contexts'] {
    return this.scenario.contexts
  }

  useContext(name: string): void {
    if (!this.scenario.contexts.some((c) => c.name === name))
      throw new RangeError(`no context named "${name}"`)
    this.ctx = name
  }

  /** The context's cluster (default: the current context). */
  cluster(context: string = this.ctx): Cluster {
    const ctx = this.scenario.contexts.find((c) => c.name === context)
    const cluster = ctx && this.clusterMap.get(ctx.cluster)
    if (!cluster) throw new RangeError(`no context named "${context}"`)
    return cluster
  }

  clusterByName(name: string): Cluster | undefined {
    return this.clusterMap.get(name)
  }

  get clusterNames(): string[] {
    return [...this.clusterMap.keys()]
  }

  /** Default namespace for a context (default: the current context). */
  namespace(context: string = this.ctx): string {
    return this.scenario.contexts.find((c) => c.name === context)?.namespace ?? 'default'
  }

  /**
   * A controller's own JSON state, kept in snapshots so a restored simulation carries on identically.
   * Returns the live object: mutate it in place.
   */
  state<T extends Record<string, unknown>>(key: string, init: () => T): T {
    const existing = this.extState[key]
    if (existing) return existing as T
    const fresh = init()
    this.extState[key] = fresh
    return fresh
  }

  setTraffic(cluster: string, namespace: string, service: string, patch: Traffic): void {
    const key = `${cluster}/${namespace}/${service}`
    this.trafficState[key] = { ...this.trafficState[key], ...patch }
  }

  traffic(cluster: string, namespace: string, service: string): Traffic {
    return { ...this.trafficState[`${cluster}/${namespace}/${service}`] }
  }

  /** Asks for `controller.wake(payload)` at sim time `at` (ms since start). */
  schedule(at: number, controller: string, payload?: unknown): void {
    if (!this.controllers.some((c) => c.name === controller))
      throw new RangeError(`no controller named "${controller}"`)
    this.push({
      at: Math.max(at, this.clock.now),
      seq: 0,
      kind: 'controller',
      controller,
      ...(payload === undefined ? {} : { payload }),
    })
  }

  /** The next pending wakeup's time, if any. */
  get nextWakeup(): number | undefined {
    return this.queue[0]?.at
  }

  /** Runs every controller once. Commands call this after changing state. */
  reconcile(): void {
    for (const c of this.controllers) c.reconcile(this)
  }

  advance(ms: number): void {
    if (ms < 0) throw new RangeError('cannot advance by a negative duration')
    this.advanceTo(this.clock.now + ms)
  }

  /** Processes every wakeup due up to sim time `t` in order, then leaves the clock at `t`. */
  advanceTo(t: number): void {
    for (let w = this.queue[0]; w !== undefined && w.at <= t; w = this.queue[0]) {
      this.queue.shift()
      this.clock.set(w.at)
      this.dispatch(w)
      this.reconcile()
    }
    this.clock.set(t)
  }

  private dispatch(w: Wakeup): void {
    if (w.kind === 'timeline') {
      const entry = this.scenario.timeline[w.index]
      const def = entry && timelineEvent(entry.type)
      if (!entry || !def) return
      const clusterName = entry.cluster
      const params = timelineParams(entry)
      const cluster = this.clusterMap.get(clusterName ?? this.scenario.clusters[0]?.name ?? '')
      if (cluster) def.apply(this, cluster, def.schema.parse(params))
      return
    }
    this.controllers.find((c) => c.name === w.controller)?.wake?.(this, w.payload)
  }

  /** Inserts keeping (at, seq) order, so wakeups at the same time run in the order they were scheduled. */
  private push(w: Wakeup): void {
    w.seq = ++this.seq
    const i = this.queue.findIndex((q) => q.at > w.at)
    if (i < 0) this.queue.push(w)
    else this.queue.splice(i, 0, w)
  }
}
