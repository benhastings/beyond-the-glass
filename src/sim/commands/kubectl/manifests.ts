import { parseAllDocuments } from 'yaml'
import type { z } from 'zod'
import type { Cluster } from '../../core/cluster.ts'
import { normalizeTemplate } from '../../core/materialize.ts'
import type {
  ConfigMap,
  Deployment,
  Kind,
  Namespace,
  ObjectMeta,
  RedactedValue,
  Resource,
  Secret,
  Service,
} from '../../core/resources.ts'
import { MANIFEST_API_VERSIONS, manifestSchema, type Manifest } from '../../core/scenario.ts'
import type { Simulator } from '../../core/simulator.ts'

/**
 * What `kubectl apply`, `diff` and `edit` share (E6-08): reading YAML, validating it the way the API
 * server does (with its messages for the common mistakes), and creating or updating the object.
 */

export const LAST_APPLIED = 'kubectl.kubernetes.io/last-applied-configuration'
/** Annotations controllers own; apply and edit leave them alone. */
const CONTROLLER_OWNED = /^deployment\.kubernetes\.io\//

/** Real fields this simulator doesn't model: named honestly rather than called "unknown". */
const REAL_BUT_UNMODELLED = new Set([
  'volumes',
  'volumeMounts',
  'tolerations',
  'affinity',
  'securityContext',
  'imagePullSecrets',
  'hostNetwork',
  'dnsPolicy',
  'lifecycle',
  'workingDir',
  'topologySpreadConstraints',
  'priorityClassName',
  'schedulerName',
  'serviceAccount',
  'automountServiceAccountToken',
  'sessionAffinityConfig',
  'externalTrafficPolicy',
  'loadBalancerIP',
  'externalIPs',
  'ownerReferences',
  'finalizers',
  'generateName',
  'immutable',
  'matchExpressions',
])

/** Go yaml's wording for the mistakes people make most, keyed by the yaml library's error codes. */
const YAML_MESSAGES: Readonly<Record<string, string>> = {
  TAB_AS_INDENT: 'found character that cannot start any token',
  BAD_INDENT: 'did not find expected key',
  MULTILINE_IMPLICIT_KEY: "could not find expected ':'",
  BLOCK_AS_IMPLICIT_KEY: 'mapping values are not allowed in this context',
  MISSING_CHAR: 'did not find expected node content',
  UNEXPECTED_TOKEN: 'did not find expected key',
  DUPLICATE_KEY: 'mapping key already defined',
}

export type Parsed = { ok: true; docs: unknown[] } | { ok: false; error: string; line: number }

/** Every document in a YAML (or JSON) file, skipping empty ones, or the first syntax error with its line. */
export function parseManifests(text: string): Parsed {
  const docs = parseAllDocuments(text, { uniqueKeys: true })
  const list = Array.isArray(docs) ? docs : [docs]
  for (const d of list) {
    const e = d.errors[0]
    if (e) {
      const line = e.linePos?.[0].line ?? 1
      const msg = YAML_MESSAGES[e.code] ?? 'did not find expected key'
      return {
        ok: false,
        line,
        error: `error converting YAML to JSON: yaml: line ${String(line)}: ${msg}`,
      }
    }
  }
  return {
    ok: true,
    docs: list.map((d) => d.toJS() as unknown).filter((d) => d !== null && d !== undefined),
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** `spec.template.spec.containers[0].image`, as the API server prints field paths. */
export function fieldPath(path: readonly PropertyKey[]): string {
  return path
    .map((p, i) => (typeof p === 'number' ? `[${String(p)}]` : `${i ? '.' : ''}${String(p)}`))
    .join('')
}

/** Go's `%#v` of a label map, which the API server puts in its messages. */
const goMap = (m: unknown) =>
  `map[string]string{${Object.entries(isObj(m) ? m : {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `"${k}":"${String(v)}"`)
    .join(', ')}}`

const valueAt = (root: unknown, path: readonly PropertyKey[]): unknown =>
  path.reduce<unknown>(
    (v, p) => (isObj(v) || Array.isArray(v) ? (v as Obj)[p as string] : undefined),
    root,
  )

/**
 * The server-populated parts of an object that `kubectl get -o yaml` and `kubectl edit` show; the API
 * server ignores them on the way in, so a re-applied export or an edited object validates.
 */
function withoutServerFields(raw: Obj): Obj {
  const o = structuredClone(raw)
  delete o.status
  if (isObj(o.metadata))
    for (const k of [
      'uid',
      'resourceVersion',
      'generation',
      'creationTimestamp',
      'managedFields',
      'selfLink',
    ])
      Reflect.deleteProperty(o.metadata, k)
  return o
}

export interface ApplyOptions {
  /** The file name kubectl names in errors. */
  source: string
  /** The `-n` or context namespace. */
  namespace: string
  /** Whether `-n` was given (an object in another namespace is then an error). */
  namespaceFlag: boolean
  dryRun: boolean
  /** `apply` records last-applied-configuration; `edit` keeps the existing one. */
  verb: 'apply' | 'edit'
}

export type ApplyResult =
  | {
      ok: true
      action: 'created' | 'configured' | 'unchanged'
      kind: Manifest['kind']
      name: string
      namespace?: string
      before?: Resource
      after: Resource
      /** Printed on stderr even though the apply worked. */
      warning?: string
    }
  | { ok: false; error: string }

function zodError(
  issues: readonly z.core.$ZodIssue[],
  raw: Obj,
  kind: string,
  name: string,
  verbing: string,
  source: string,
): string {
  const version = String(raw.apiVersion).split('/').pop() ?? 'v1'
  const unknown = issues.flatMap((i) =>
    i.code === 'unrecognized_keys' ? i.keys.map((k) => ({ path: [...i.path, k], key: k })) : [],
  )
  const unmodelled = unknown.find((u) => REAL_BUT_UNMODELLED.has(u.key))
  if (unmodelled)
    return `error: ${fieldPath(unmodelled.path)} (in "${source}") is a real field, but this simulator doesn't model it yet. Remove it and apply again.`
  if (unknown.length)
    return `Error from server (BadRequest): error when ${verbing} "${source}": ${kind} in version "${version}" cannot be handled as a ${kind}: strict decoding error: ${unknown.map((u) => `unknown field "${fieldPath(u.path)}"`).join(', ')}`
  const issue = issues[0]
  if (!issue) return `error: "${source}" is not a valid ${kind}`
  const value = valueAt(raw, issue.path)
  if (issue.code === 'invalid_type' && value !== undefined) {
    const got = Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value
    const want =
      issue.expected === 'number' ? 'int32' : issue.expected === 'object' ? 'map' : issue.expected
    return `Error from server (BadRequest): error when ${verbing} "${source}": ${kind} in version "${version}" cannot be handled as a ${kind}: json: cannot unmarshal ${got} into Go struct field .${fieldPath(issue.path)} of type ${want}`
  }
  let detail: string
  if (value === undefined) detail = `${fieldPath(issue.path)}: Required value`
  else if (issue.path.at(-1) === 'selector' && issue.code === 'custom')
    detail = `spec.template.metadata.labels: Invalid value: ${goMap(valueAt(raw, ['spec', 'template', 'metadata', 'labels']))}: \`selector\` does not match template \`labels\``
  else if (issue.path.join('.') === 'metadata.name')
    detail = `metadata.name: Invalid value: ${JSON.stringify(value)}: a lowercase RFC 1123 subdomain must consist of lower case alphanumeric characters, '-' or '.', and must start and end with an alphanumeric character (e.g. 'example.com', regex used for validation is '[a-z0-9]([-a-z0-9]*[a-z0-9])?(\\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*')`
  else
    detail = `${fieldPath(issue.path)}: Invalid value: ${JSON.stringify(value)}: ${issue.message}`
  return `The ${kind} "${name}" is invalid: ${detail}`
}

const REDACTED = /^<redacted: (\d+) bytes>$/

const resourcePlural = (kind: string) =>
  kind === 'Deployment' ? 'deployments.apps' : `${kind.toLowerCase()}s`

/** Leaves controller-owned annotations and (for apply) records what was applied. */
function annotationsFor(
  live: Resource | undefined,
  m: Manifest,
  lastApplied: string | undefined,
): Record<string, string> | undefined {
  const kept = Object.fromEntries(
    Object.entries(live?.metadata.annotations ?? {}).filter(
      ([k]) => CONTROLLER_OWNED.test(k) || (k === LAST_APPLIED && lastApplied === undefined),
    ),
  )
  const out = {
    ...kept,
    ...m.metadata.annotations,
    ...(lastApplied !== undefined ? { [LAST_APPLIED]: lastApplied } : {}),
  }
  return Object.keys(out).length ? out : undefined
}

/** The parts an apply can change, for deciding between "configured" and "unchanged". */
function comparable(o: Resource | undefined): string {
  if (!o) return ''
  const { metadata, ...rest } = o as Resource & Obj
  const annotations = Object.fromEntries(
    Object.entries(metadata.annotations ?? {}).filter(([k]) => k !== LAST_APPLIED),
  )
  const body = { ...rest }
  delete body.status
  return JSON.stringify({ labels: metadata.labels ?? {}, annotations, body })
}

function allocateServiceIP(sim: Simulator, cluster: Cluster): string {
  const used = new Set(cluster.list('Service').map((s) => s.spec.clusterIP))
  for (;;) {
    const ip = `10.96.${String(sim.rng.int(256))}.${String(1 + sim.rng.int(254))}`
    if (!used.has(ip)) return ip
  }
}

/**
 * Validates one object from a manifest (or an edited object) and creates or updates it, unless
 * `dryRun`. Errors carry kubectl's wording; nothing changes when there is one.
 */
export function applyObject(
  sim: Simulator,
  cluster: Cluster,
  input: unknown,
  opts: ApplyOptions,
): ApplyResult {
  if (!isObj(input))
    return {
      ok: false,
      error: `error: error validating "${opts.source}": error validating data: invalid object to validate; if you choose to ignore these errors, turn validation off with --validate=false`,
    }
  const missing = ['apiVersion', 'kind'].filter((k) => typeof input[k] !== 'string' || !input[k])
  if (missing.length)
    return {
      ok: false,
      error: `error: error validating "${opts.source}": error validating data: [${missing.map((k) => `${k} not set`).join(', ')}]; if you choose to ignore these errors, turn validation off with --validate=false`,
    }
  const kind = String(input.kind)
  const apiVersion = String(input.apiVersion)
  const meta = isObj(input.metadata) ? input.metadata : {}
  const name = typeof meta.name === 'string' ? meta.name : ''
  const docNs = typeof meta.namespace === 'string' ? meta.namespace : undefined
  if (MANIFEST_API_VERSIONS[kind] !== apiVersion)
    return {
      ok: false,
      error: `error: resource mapping not found for name: "${name}" namespace: "${docNs ?? ''}" from "${opts.source}": no matches for kind "${kind}" in version "${apiVersion}"\nensure CRDs are installed first`,
    }
  const namespaced = kind !== 'Namespace'
  if (namespaced && docNs && opts.namespaceFlag && docNs !== opts.namespace)
    return {
      ok: false,
      error: `error: the namespace from the provided object "${docNs}" does not match the namespace "${opts.namespace}". You must pass '--namespace=${docNs}' to perform this operation.`,
    }
  const ns = namespaced ? (docNs ?? opts.namespace) : undefined
  const cleaned = withoutServerFields(input)
  if (namespaced && isObj(cleaned.metadata)) cleaned.metadata.namespace = ns
  const live = name ? cluster.get(kind as Kind, ns, name) : undefined
  // Secret values never enter the simulation: placeholders from `get -o yaml` keep the live value.
  const liveSecret = live?.kind === 'Secret' ? live : undefined
  if (kind === 'Secret' && isObj(cleaned.data))
    for (const [k, v] of Object.entries(cleaned.data))
      if (typeof v === 'string' && REDACTED.test(v))
        cleaned.data[k] = 'A'.repeat(Math.ceil(((liveSecret?.data[k]?.bytes ?? 0) * 4) / 3))
  const verbing = live ? 'patching' : 'creating'
  const parsed = manifestSchema.safeParse(cleaned)
  if (!parsed.success)
    return {
      ok: false,
      error: zodError(parsed.error.issues, cleaned, kind, name, verbing, opts.source),
    }
  const m = parsed.data
  if (ns && !cluster.get('Namespace', undefined, ns))
    return {
      ok: false,
      error: `Error from server (NotFound): error when ${verbing} "${opts.source}": namespaces "${ns}" not found`,
    }

  let lastApplied: string | undefined
  if (opts.verb === 'apply') {
    const recorded = structuredClone(cleaned)
    if (kind === 'Secret')
      for (const field of ['data', 'stringData'])
        if (isObj(recorded[field]))
          for (const k of Object.keys(recorded[field])) recorded[field][k] = '<redacted>'
    lastApplied = `${JSON.stringify(recorded)}\n`
  }
  const now = sim.clock.iso()
  const metadata: ObjectMeta = {
    ...(live
      ? structuredClone(live.metadata)
      : { uid: '', resourceVersion: '', creationTimestamp: now }),
    name: m.metadata.name,
    ...(ns ? { namespace: ns } : {}),
  }
  if (m.metadata.labels) metadata.labels = { ...m.metadata.labels }
  else delete metadata.labels
  const annotations = annotationsFor(live, m, lastApplied)
  if (annotations) metadata.annotations = annotations
  else delete metadata.annotations

  let next: Resource
  switch (m.kind) {
    case 'Deployment': {
      const prev = live?.kind === 'Deployment' ? live : undefined
      if (
        prev &&
        JSON.stringify(prev.spec.selector.matchLabels) !==
          JSON.stringify(m.spec.selector.matchLabels)
      )
        return {
          ok: false,
          error: `The Deployment "${name}" is invalid: spec.selector: Invalid value: v1.LabelSelector{MatchLabels:${goMap(m.spec.selector.matchLabels)}, MatchExpressions:[]v1.LabelSelectorRequirement(nil)}: field is immutable`,
        }
      const spec: Deployment['spec'] = {
        replicas: m.spec.replicas,
        selector: { matchLabels: { ...m.spec.selector.matchLabels } },
        template: normalizeTemplate(m.spec.template),
        strategy: m.spec.strategy
          ? structuredClone(m.spec.strategy)
          : { type: 'RollingUpdate', rollingUpdate: { maxSurge: '25%', maxUnavailable: '25%' } },
        revisionHistoryLimit: m.spec.revisionHistoryLimit ?? 10,
        progressDeadlineSeconds: m.spec.progressDeadlineSeconds ?? 600,
        ...(m.spec.minReadySeconds !== undefined
          ? { minReadySeconds: m.spec.minReadySeconds }
          : {}),
        ...(m.spec.paused !== undefined ? { paused: m.spec.paused } : {}),
      }
      const specChanged = JSON.stringify(spec) !== JSON.stringify(prev?.spec)
      next = {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: {
          ...metadata,
          generation: (prev?.metadata.generation ?? 0) + (specChanged || !prev ? 1 : 0),
        },
        spec,
        status: prev ? structuredClone(prev.status) : {},
      } satisfies Deployment
      break
    }
    case 'Service': {
      const prev = live?.kind === 'Service' ? live : undefined
      if (prev && m.spec.clusterIP && m.spec.clusterIP !== prev.spec.clusterIP)
        return {
          ok: false,
          error: `The Service "${name}" is invalid: spec.clusterIPs[0]: Invalid value: []string{"${m.spec.clusterIP}"}: may not change once set`,
        }
      const ip = prev?.spec.clusterIP ?? m.spec.clusterIP ?? allocateServiceIP(sim, cluster)
      next = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata,
        spec: {
          type: m.spec.type,
          ...(m.spec.selector ? { selector: { ...m.spec.selector } } : {}),
          clusterIP: ip,
          clusterIPs: [ip],
          sessionAffinity: m.spec.sessionAffinity ?? 'None',
          ports: m.spec.ports.map((p) => ({ ...p, targetPort: p.targetPort ?? p.port })),
        },
        status: { loadBalancer: {} },
      } satisfies Service
      break
    }
    case 'ConfigMap':
      next = {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata,
        data: { ...m.data },
      } satisfies ConfigMap
      break
    case 'Secret':
      next = {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata,
        type: m.type,
        data: structuredClone<Record<string, RedactedValue>>(m.data),
      } satisfies Secret
      break
    case 'Namespace':
      next = {
        apiVersion: 'v1',
        kind: 'Namespace',
        metadata: {
          ...metadata,
          labels: { 'kubernetes.io/metadata.name': name, ...metadata.labels },
        },
        status: { phase: 'Active' },
      } satisfies Namespace
      break
  }
  // kubectl apply on an object nobody applied before patches in the annotation it needs, and says so.
  const unannotated =
    opts.verb === 'apply' && live !== undefined && !live.metadata.annotations?.[LAST_APPLIED]
  const action = !live
    ? 'created'
    : comparable(live) === comparable(next) && !unannotated
      ? 'unchanged'
      : 'configured'
  const warning = unannotated
    ? `Warning: resource ${resourcePlural(m.kind)}/${name} is missing the ${LAST_APPLIED} annotation which is required by kubectl apply. kubectl apply should only be used on resources created declaratively by either kubectl create --save-config or kubectl apply. The missing annotation will be patched automatically.`
    : undefined
  const before = live ? structuredClone(live) : undefined
  if (!opts.dryRun && action !== 'unchanged') cluster.put(next)
  else if (!opts.dryRun && lastApplied !== undefined && live) {
    // Unchanged objects still get the record of what was applied.
    live.metadata.annotations = { ...live.metadata.annotations, [LAST_APPLIED]: lastApplied }
    cluster.put(live)
  }
  return {
    ok: true,
    action,
    kind: m.kind,
    name,
    ...(ns ? { namespace: ns } : {}),
    ...(before ? { before } : {}),
    ...(warning ? { warning } : {}),
    after: structuredClone(next),
  }
}
