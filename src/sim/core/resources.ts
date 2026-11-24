/**
 * The simulated resource model: a subset of the real Kubernetes API objects, with the same field names,
 * so `-o yaml` and `describe` can read like the real thing. Timestamps are RFC 3339 strings.
 */

export type Labels = Record<string, string>

export interface OwnerReference {
  apiVersion: string
  kind: string
  name: string
  uid: string
  controller?: boolean
  blockOwnerDeletion?: boolean
}

export interface ObjectMeta {
  name: string
  generateName?: string
  namespace?: string
  uid: string
  resourceVersion: string
  generation?: number
  creationTimestamp: string
  deletionTimestamp?: string
  labels?: Labels
  annotations?: Record<string, string>
  ownerReferences?: OwnerReference[]
}

export interface Condition {
  type: string
  status: 'True' | 'False' | 'Unknown'
  reason?: string
  message?: string
  lastTransitionTime?: string
  lastUpdateTime?: string
  lastProbeTime?: string | null
  lastHeartbeatTime?: string
}

export type ResourceList = Partial<Record<'cpu' | 'memory' | 'pods' | 'ephemeral-storage', string>>

export interface Probe {
  httpGet?: { path: string; port: number | string; scheme?: string }
  tcpSocket?: { port: number | string }
  exec?: { command: string[] }
  initialDelaySeconds?: number
  periodSeconds?: number
  timeoutSeconds?: number
  successThreshold?: number
  failureThreshold?: number
}

export interface EnvVar {
  name: string
  value?: string
  valueFrom?: {
    configMapKeyRef?: { name: string; key: string; optional?: boolean }
    secretKeyRef?: { name: string; key: string; optional?: boolean }
  }
}

export interface Container {
  name: string
  image: string
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never'
  command?: string[]
  args?: string[]
  ports?: { name?: string; containerPort: number; protocol?: string }[]
  env?: EnvVar[]
  envFrom?: { configMapRef?: { name: string }; secretRef?: { name: string } }[]
  resources?: { requests?: ResourceList; limits?: ResourceList }
  readinessProbe?: Probe
  livenessProbe?: Probe
  startupProbe?: Probe
}

export interface PodSpec {
  containers: Container[]
  initContainers?: Container[]
  nodeName?: string
  restartPolicy?: 'Always' | 'OnFailure' | 'Never'
  serviceAccountName?: string
  terminationGracePeriodSeconds?: number
  nodeSelector?: Labels
}

export interface ContainerState {
  waiting?: { reason: string; message?: string }
  running?: { startedAt: string }
  terminated?: {
    exitCode: number
    reason?: string
    message?: string
    startedAt?: string
    finishedAt?: string
    signal?: number
  }
}

export interface ContainerStatus {
  name: string
  image: string
  imageID: string
  containerID?: string
  ready: boolean
  started?: boolean
  restartCount: number
  state: ContainerState
  lastState: ContainerState
}

export interface Pod {
  apiVersion: 'v1'
  kind: 'Pod'
  metadata: ObjectMeta
  spec: PodSpec
  status: {
    phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'
    conditions?: Condition[]
    hostIP?: string
    podIP?: string
    startTime?: string
    qosClass?: 'Guaranteed' | 'Burstable' | 'BestEffort'
    reason?: string
    message?: string
    containerStatuses?: ContainerStatus[]
  }
}

export interface PodTemplateSpec {
  metadata: { labels?: Labels; annotations?: Record<string, string> }
  spec: PodSpec
}

export interface LabelSelector {
  matchLabels?: Labels
  matchExpressions?: {
    key: string
    operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'
    values?: string[]
  }[]
}

export interface Deployment {
  apiVersion: 'apps/v1'
  kind: 'Deployment'
  metadata: ObjectMeta
  spec: {
    replicas: number
    selector: LabelSelector
    template: PodTemplateSpec
    strategy: {
      type: 'RollingUpdate' | 'Recreate'
      rollingUpdate?: { maxSurge: number | string; maxUnavailable: number | string }
    }
    revisionHistoryLimit: number
    progressDeadlineSeconds: number
    minReadySeconds?: number
    paused?: boolean
  }
  status: {
    observedGeneration?: number
    replicas?: number
    updatedReplicas?: number
    readyReplicas?: number
    availableReplicas?: number
    unavailableReplicas?: number
    conditions?: Condition[]
    collisionCount?: number
  }
}

export interface ReplicaSet {
  apiVersion: 'apps/v1'
  kind: 'ReplicaSet'
  metadata: ObjectMeta
  spec: {
    replicas: number
    selector: LabelSelector
    template: PodTemplateSpec
    minReadySeconds?: number
  }
  status: {
    replicas: number
    fullyLabeledReplicas?: number
    readyReplicas?: number
    availableReplicas?: number
    observedGeneration?: number
  }
}

export interface ServicePort {
  name?: string
  protocol: 'TCP' | 'UDP' | 'SCTP'
  port: number
  targetPort: number | string
  nodePort?: number
}

export interface Service {
  apiVersion: 'v1'
  kind: 'Service'
  metadata: ObjectMeta
  spec: {
    type: 'ClusterIP' | 'NodePort' | 'LoadBalancer' | 'ExternalName'
    selector?: Labels
    ports: ServicePort[]
    clusterIP: string
    clusterIPs?: string[]
    sessionAffinity?: 'None' | 'ClientIP'
  }
  status: { loadBalancer: Record<string, unknown> }
}

export interface EndpointAddress {
  ip: string
  nodeName?: string
  targetRef?: { kind: 'Pod'; name: string; namespace: string; uid: string }
}

/** A derived view: never stored, always computed from Services and Pods. */
export interface Endpoints {
  apiVersion: 'v1'
  kind: 'Endpoints'
  metadata: Pick<ObjectMeta, 'name' | 'namespace' | 'creationTimestamp' | 'labels'>
  subsets: {
    addresses?: EndpointAddress[]
    notReadyAddresses?: EndpointAddress[]
    ports: { name?: string; port: number; protocol: string }[]
  }[]
}

export interface ConfigMap {
  apiVersion: 'v1'
  kind: 'ConfigMap'
  metadata: ObjectMeta
  data: Record<string, string>
}

/**
 * Secret values are never kept: only each key's length survives loading, so no view can reveal one.
 */
export interface RedactedValue {
  redacted: true
  bytes: number
}

export interface Secret {
  apiVersion: 'v1'
  kind: 'Secret'
  metadata: ObjectMeta
  type: string
  data: Record<string, RedactedValue>
}

export interface Namespace {
  apiVersion: 'v1'
  kind: 'Namespace'
  metadata: ObjectMeta
  status: { phase: 'Active' | 'Terminating' }
}

export interface Node {
  apiVersion: 'v1'
  kind: 'Node'
  metadata: ObjectMeta
  spec: {
    podCIDR?: string
    taints?: { key: string; effect: string; value?: string }[]
    unschedulable?: boolean
  }
  status: {
    capacity: ResourceList
    allocatable: ResourceList
    conditions: Condition[]
    addresses: { type: 'InternalIP' | 'Hostname'; address: string }[]
    nodeInfo: {
      kubeletVersion: string
      containerRuntimeVersion: string
      osImage: string
      kernelVersion: string
      operatingSystem: string
      architecture: string
    }
  }
}

export interface ObjectReference {
  kind: string
  name: string
  namespace?: string
  uid?: string
  apiVersion?: string
  fieldPath?: string
}

export interface Event {
  apiVersion: 'v1'
  kind: 'Event'
  metadata: ObjectMeta
  involvedObject: ObjectReference
  reason: string
  message: string
  type: 'Normal' | 'Warning'
  count: number
  firstTimestamp: string
  lastTimestamp: string
  source: { component: string; host?: string }
  reportingComponent?: string
}

export interface KindMap {
  Namespace: Namespace
  Node: Node
  Deployment: Deployment
  ReplicaSet: ReplicaSet
  Pod: Pod
  Service: Service
  ConfigMap: ConfigMap
  Secret: Secret
  Event: Event
}

export type Kind = keyof KindMap
export type Resource = KindMap[Kind]

export const KINDS: readonly Kind[] = [
  'Namespace',
  'Node',
  'Deployment',
  'ReplicaSet',
  'Pod',
  'Service',
  'ConfigMap',
  'Secret',
  'Event',
]

/** Cluster-scoped kinds have no namespace. */
export const CLUSTER_SCOPED: ReadonlySet<Kind> = new Set(['Namespace', 'Node'])
