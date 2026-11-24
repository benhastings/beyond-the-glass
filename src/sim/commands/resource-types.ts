/** Resource types kubectl knows, with their short names: what `get <type>` and "Did you mean" draw on. */
export interface ResourceType {
  plural: string
  singular: string
  short: readonly string[]
  kind: string
  namespaced: boolean
}

export const RESOURCE_TYPES: readonly ResourceType[] = [
  { plural: 'pods', singular: 'pod', short: ['po'], kind: 'Pod', namespaced: true },
  {
    plural: 'deployments',
    singular: 'deployment',
    short: ['deploy'],
    kind: 'Deployment',
    namespaced: true,
  },
  {
    plural: 'replicasets',
    singular: 'replicaset',
    short: ['rs'],
    kind: 'ReplicaSet',
    namespaced: true,
  },
  { plural: 'services', singular: 'service', short: ['svc'], kind: 'Service', namespaced: true },
  {
    plural: 'endpoints',
    singular: 'endpoints',
    short: ['ep'],
    kind: 'Endpoints',
    namespaced: true,
  },
  { plural: 'nodes', singular: 'node', short: ['no'], kind: 'Node', namespaced: false },
  {
    plural: 'namespaces',
    singular: 'namespace',
    short: ['ns'],
    kind: 'Namespace',
    namespaced: false,
  },
  {
    plural: 'configmaps',
    singular: 'configmap',
    short: ['cm'],
    kind: 'ConfigMap',
    namespaced: true,
  },
  { plural: 'secrets', singular: 'secret', short: [], kind: 'Secret', namespaced: true },
  { plural: 'events', singular: 'event', short: ['ev'], kind: 'Event', namespaced: true },
  {
    plural: 'statefulsets',
    singular: 'statefulset',
    short: ['sts'],
    kind: 'StatefulSet',
    namespaced: true,
  },
  {
    plural: 'daemonsets',
    singular: 'daemonset',
    short: ['ds'],
    kind: 'DaemonSet',
    namespaced: true,
  },
  { plural: 'jobs', singular: 'job', short: [], kind: 'Job', namespaced: true },
  { plural: 'cronjobs', singular: 'cronjob', short: ['cj'], kind: 'CronJob', namespaced: true },
  { plural: 'ingresses', singular: 'ingress', short: ['ing'], kind: 'Ingress', namespaced: true },
  {
    plural: 'persistentvolumeclaims',
    singular: 'persistentvolumeclaim',
    short: ['pvc'],
    kind: 'PersistentVolumeClaim',
    namespaced: true,
  },
  {
    plural: 'horizontalpodautoscalers',
    singular: 'horizontalpodautoscaler',
    short: ['hpa'],
    kind: 'HorizontalPodAutoscaler',
    namespaced: true,
  },
]

/** Every name a type can be called by (`pods`, `pod`, `po`, `Pod`, `pods.v1`, …is close enough). */
export function allTypeNames(): string[] {
  return RESOURCE_TYPES.flatMap((t) => [t.plural, t.singular, ...t.short])
}

export function resolveType(name: string): ResourceType | undefined {
  const n = name.toLowerCase().replace(/\..*$/, '')
  return RESOURCE_TYPES.find(
    (t) => t.plural === n || t.singular === n || t.short.includes(n) || t.kind.toLowerCase() === n,
  )
}
