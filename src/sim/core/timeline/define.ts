import type { z } from 'zod'
import type { Cluster } from '../cluster.ts'
import type { Manifest } from '../scenario.ts'
import type { Simulator } from '../simulator.ts'

export interface Problem {
  path: (string | number)[]
  message: string
}

/**
 * One kind of timeline event. Each lives in its own file and is listed once in ./index.ts.
 * `check` validates references against the cluster's manifests when the scenario is loaded;
 * `apply` changes the simulation when the event's time comes.
 */
export interface TimelineEventDef<P> {
  type: string
  description: string
  schema: z.ZodType<P>
  check?: (params: P, resources: Manifest[]) => Problem[]
  apply: (sim: Simulator, cluster: Cluster, params: P) => void
}

/** A timeline entry's own parameters: everything except `at`, `type` and `cluster`. */
export function timelineParams(entry: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(entry).filter(([k]) => k !== 'at' && k !== 'type' && k !== 'cluster'),
  )
}

export function defineTimelineEvent<P>(def: TimelineEventDef<P>): TimelineEventDef<P> {
  return def
}

/** Problems if the cluster's manifests have no `kind` named `name` in `namespace`. */
export function requireResource(
  resources: Manifest[],
  kind: Manifest['kind'],
  namespace: string,
  name: string,
  path: (string | number)[],
): Problem[] {
  const found = resources.some(
    (r) =>
      r.kind === kind &&
      r.metadata.name === name &&
      (r.metadata.namespace ?? 'default') === namespace,
  )
  return found ? [] : [{ path, message: `no ${kind} ${namespace}/${name} in this cluster` }]
}

/** Problems if the Deployment has no container `container`. */
export function requireContainer(
  resources: Manifest[],
  namespace: string,
  deployment: string,
  container: string,
): Problem[] {
  const d = resources.find(
    (r) =>
      r.kind === 'Deployment' &&
      r.metadata.name === deployment &&
      (r.metadata.namespace ?? 'default') === namespace,
  )
  if (d?.kind !== 'Deployment')
    return requireResource(resources, 'Deployment', namespace, deployment, ['deployment'])
  return d.spec.template.spec.containers.some((c) => c.name === container)
    ? []
    : [{ path: ['container'], message: `${deployment} has no container "${container}"` }]
}
