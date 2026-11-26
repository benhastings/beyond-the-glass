import { z } from 'zod'
import { POLICIES } from '../gitops/policies.ts'
import { behaviourSchema } from './behaviour.ts'
import { isDuration } from './duration.ts'
import type { RedactedValue } from './resources.ts'
import { TIMELINE_EVENTS, timelineEvent, timelineParams } from './timeline/index.ts'

/**
 * The scenario file format (`src/scenarios/*.yaml`). A scenario describes one or more clusters as they
 * are when the learner arrives, plus a timeline of things that happen afterwards. Manifests use the
 * real Kubernetes field names; the few sim-only fields are documented in docs/sim/scenarios.md.
 */

const slug = z
  .string()
  .regex(/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/, 'must be a lowercase DNS-1123 name')
const labels = z.record(z.string(), z.string())
/** A relative sim time (`-3d`, `+4m`) or an absolute RFC 3339 timestamp. */
const simTime = z
  .string()
  .refine(
    (t) => isDuration(t) || !Number.isNaN(Date.parse(t)),
    'must be a duration like -3d or +4m, or an RFC 3339 timestamp',
  )
const quantity = z.union([z.string(), z.number()]).transform(String)
const resourceList = z.strictObject({
  cpu: quantity.optional(),
  memory: quantity.optional(),
  'ephemeral-storage': quantity.optional(),
})
const port = z.union([z.number().int().min(1).max(65535), z.string()])

const probe = z.strictObject({
  httpGet: z.strictObject({ path: z.string(), port, scheme: z.string().optional() }).optional(),
  tcpSocket: z.strictObject({ port }).optional(),
  exec: z.strictObject({ command: z.array(z.string()) }).optional(),
  initialDelaySeconds: z.number().int().nonnegative().optional(),
  periodSeconds: z.number().int().positive().optional(),
  timeoutSeconds: z.number().int().positive().optional(),
  successThreshold: z.number().int().positive().optional(),
  failureThreshold: z.number().int().positive().optional(),
})

const keyRef = z.strictObject({
  name: z.string(),
  key: z.string(),
  optional: z.boolean().optional(),
})
const container = z.strictObject({
  name: slug,
  image: z.string().min(1),
  imagePullPolicy: z.enum(['Always', 'IfNotPresent', 'Never']).optional(),
  command: z.array(z.string()).optional(),
  args: z.array(z.string()).optional(),
  ports: z
    .array(
      z.strictObject({
        name: z.string().optional(),
        containerPort: z.number().int(),
        protocol: z.string().optional(),
      }),
    )
    .optional(),
  env: z
    .array(
      z.strictObject({
        name: z.string(),
        value: z.string().optional(),
        valueFrom: z
          .strictObject({ configMapKeyRef: keyRef.optional(), secretKeyRef: keyRef.optional() })
          .optional(),
      }),
    )
    .optional(),
  envFrom: z
    .array(
      z.strictObject({
        configMapRef: z.strictObject({ name: z.string() }).optional(),
        secretRef: z.strictObject({ name: z.string() }).optional(),
      }),
    )
    .optional(),
  resources: z
    .strictObject({ requests: resourceList.optional(), limits: resourceList.optional() })
    .optional(),
  readinessProbe: probe.optional(),
  livenessProbe: probe.optional(),
  startupProbe: probe.optional(),
})

const podSpec = z.strictObject({
  containers: z.array(container).min(1),
  initContainers: z.array(container).optional(),
  restartPolicy: z.enum(['Always', 'OnFailure', 'Never']).optional(),
  serviceAccountName: z.string().optional(),
  terminationGracePeriodSeconds: z.number().int().nonnegative().optional(),
  nodeSelector: labels.optional(),
})

const metadata = z.strictObject({
  name: slug,
  namespace: slug.optional(),
  labels: labels.optional(),
  annotations: labels.optional(),
  /** Sim extension: when the object was created, e.g. `-5d`. Defaults to the cluster's `age`. */
  creationTimestamp: simTime.optional(),
})

const deployment = z.strictObject({
  apiVersion: z.literal('apps/v1'),
  kind: z.literal('Deployment'),
  metadata,
  spec: z
    .strictObject({
      replicas: z.number().int().nonnegative().default(1),
      selector: z.strictObject({ matchLabels: labels }),
      template: z.strictObject({
        metadata: z.strictObject({ labels, annotations: labels.optional() }),
        spec: podSpec,
      }),
      strategy: z
        .strictObject({
          type: z.enum(['RollingUpdate', 'Recreate']),
          rollingUpdate: z
            .strictObject({
              maxSurge: z.union([z.number(), z.string()]),
              maxUnavailable: z.union([z.number(), z.string()]),
            })
            .optional(),
        })
        .optional(),
      revisionHistoryLimit: z.number().int().nonnegative().optional(),
      progressDeadlineSeconds: z.number().int().positive().optional(),
      minReadySeconds: z.number().int().nonnegative().optional(),
      paused: z.boolean().optional(),
    })
    .refine(
      (s) =>
        Object.entries(s.selector.matchLabels).every(
          ([k, v]) => s.template.metadata.labels[k] === v,
        ),
      { error: '`selector` does not match template `labels`', path: ['selector'] },
    ),
})

const service = z.strictObject({
  apiVersion: z.literal('v1'),
  kind: z.literal('Service'),
  metadata,
  spec: z.strictObject({
    type: z.enum(['ClusterIP', 'NodePort', 'LoadBalancer']).default('ClusterIP'),
    selector: labels.optional(),
    clusterIP: z.string().optional(),
    // Filled in by the API server; accepted so `kubectl edit` and re-applied exports validate.
    clusterIPs: z.array(z.string()).optional(),
    sessionAffinity: z.enum(['None', 'ClientIP']).optional(),
    internalTrafficPolicy: z.enum(['Cluster', 'Local']).optional(),
    ports: z
      .array(
        z.strictObject({
          name: z.string().optional(),
          protocol: z.enum(['TCP', 'UDP', 'SCTP']).default('TCP'),
          port: z.number().int().min(1).max(65535),
          targetPort: port.optional(),
          nodePort: z.number().int().optional(),
        }),
      )
      .min(1),
  }),
})

const configMap = z.strictObject({
  apiVersion: z.literal('v1'),
  kind: z.literal('ConfigMap'),
  metadata,
  data: z.record(z.string(), z.string()).default({}),
})

/** Base64 `data` and plain `stringData`, as in a real manifest. Only each value's length survives parsing. */
const secret = z
  .strictObject({
    apiVersion: z.literal('v1'),
    kind: z.literal('Secret'),
    metadata,
    type: z.string().default('Opaque'),
    data: z.record(z.string(), z.string()).optional(),
    stringData: z.record(z.string(), z.string()).optional(),
  })
  .transform(({ data, stringData, ...rest }) => ({
    ...rest,
    data: redact(data ?? {}, stringData ?? {}),
  }))

function redact(data: Record<string, string>, stringData: Record<string, string>) {
  const out: Record<string, RedactedValue> = {}
  for (const [k, v] of Object.entries(data)) out[k] = { redacted: true, bytes: base64Bytes(v) }
  for (const [k, v] of Object.entries(stringData))
    out[k] = { redacted: true, bytes: new TextEncoder().encode(v).length }
  return out
}

function base64Bytes(b64: string): number {
  const clean = b64.replace(/\s/g, '')
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((clean.length * 3) / 4) - pad)
}

const namespace = z.strictObject({
  apiVersion: z.literal('v1'),
  kind: z.literal('Namespace'),
  metadata,
})

const manifest = z.discriminatedUnion('kind', [deployment, service, configMap, secret, namespace])

/** One Kubernetes object as `kubectl apply` reads it (E6-08); strict, so unknown fields are reported. */
export const manifestSchema = manifest
/** The apiVersion each kind the simulator knows is served at. */
export const MANIFEST_API_VERSIONS: Readonly<Record<string, string>> = {
  Deployment: 'apps/v1',
  Service: 'v1',
  ConfigMap: 'v1',
  Secret: 'v1',
  Namespace: 'v1',
}

const containerStateInput = z.strictObject({
  waiting: z.strictObject({ reason: z.string(), message: z.string().optional() }).optional(),
  running: z.strictObject({ startedAt: simTime }).optional(),
  terminated: z
    .strictObject({
      exitCode: z.number().int(),
      reason: z.string().optional(),
      message: z.string().optional(),
      startedAt: simTime.optional(),
      finishedAt: simTime.optional(),
      signal: z.number().int().optional(),
    })
    .optional(),
})

/**
 * Sim extension: the state of one replica of a Deployment when the scenario starts, for things that
 * happened before the learner arrived (a pod that has been crash-looping for an hour, say).
 */
const podOverride = z.strictObject({
  namespace: slug.default('default'),
  deployment: slug,
  replica: z.number().int().nonnegative().default(0),
  createdAt: simTime.optional(),
  containers: z.record(
    z.string(),
    z.strictObject({
      ready: z.boolean().optional(),
      restartCount: z.number().int().nonnegative().optional(),
      state: containerStateInput.optional(),
      lastState: containerStateInput.optional(),
    }),
  ),
})

const node = z.strictObject({
  name: slug,
  role: z.enum(['control-plane', 'worker']).default('worker'),
  cpu: quantity.default('4'),
  memory: quantity.default('8Gi'),
  pods: z.number().int().positive().default(110),
})

const cluster = z.strictObject({
  name: slug,
  /** API server URL shown by `kubectl config` and `cluster-info`. Use a `.example` host. */
  server: z.url(),
  kubernetesVersion: z
    .string()
    .regex(/^v\d+\.\d+\.\d+$/)
    .default('v1.34.0'),
  /** `kind` adds the system pods a kind cluster runs (CoreDNS, kube-proxy, ...); `none` adds nothing. */
  system: z.enum(['kind', 'none']).default('kind'),
  /** How long before scenario start the cluster and, by default, its objects were created. */
  age: simTime.default('-14d'),
  nodes: z.array(node).min(1),
  resources: z.array(manifest).default([]),
  podOverrides: z.array(podOverride).default([]),
})

const context = z.strictObject({
  name: z.string().min(1),
  cluster: slug,
  user: z.string().min(1),
  namespace: slug.optional(),
})

/** The fields every timeline entry has; the rest depend on `type` (see ./timeline/). */
const timelineEntry = z.looseObject({
  at: simTime.refine(
    (t) => isDuration(t) && !t.startsWith('-'),
    'timeline times are offsets from start, like +4m',
  ),
  type: z.string(),
  cluster: slug.optional(),
})

export const scenarioSchema = z
  .strictObject({
    id: slug,
    title: z.string().min(1),
    description: z.string().optional(),
    seed: z.union([z.number().int(), z.string()]).default(1998),
    startTime: z.iso.datetime().optional(),
    currentContext: z.string(),
    contexts: z.array(context).min(1),
    clusters: z.array(cluster).min(1),
    timeline: z.array(timelineEntry).default([]),
    /**
     * GitOps (E7-01): Git repositories (path → file) and the Argo CD applications that deploy them. The
     * reconcile loop runs every `reconcileInterval` of sim time (Argo's default is 3 minutes).
     */
    gitops: z
      .strictObject({
        reconcileInterval: simTime.default('+3m'),
        repos: z
          .record(
            slug,
            z.strictObject({
              branch: z.string().default('main'),
              files: z.record(z.string(), z.string()).default({}),
              /**
               * Manifests copied from the scenario's own resources (E10-01): every Deployment, Service,
               * ConfigMap and Secret in `namespace` on `cluster`, written under `path`. Git and the
               * cluster then agree from the start, without writing each manifest twice.
               */
              mirror: z
                .array(z.strictObject({ cluster: slug, namespace: slug, path: z.string() }))
                .default([]),
            }),
          )
          .default({}),
        applications: z
          .array(
            z.strictObject({
              name: slug,
              project: z.string().default('default'),
              source: z.strictObject({
                repo: slug,
                path: z.string(),
                targetRevision: z.string().default('main'),
              }),
              destination: z.strictObject({ cluster: slug, namespace: slug }),
              syncPolicy: z
                .strictObject({
                  automated: z
                    .strictObject({
                      prune: z.boolean().default(false),
                      selfHeal: z.boolean().default(false),
                    })
                    .optional(),
                })
                .optional(),
            }),
          )
          .default([]),
        /**
         * CI (E7-02): per app repo, the image its pipeline builds and, optionally, the deploy repo file whose
         * `image:` line the update-manifests job rewrites.
         */
        ci: z
          .record(
            slug,
            z.strictObject({
              image: z
                .string()
                .regex(/^[\w.-]+(\/[\w.-]+)+$/, 'an image name without a tag')
                .optional(),
              deploy: z.strictObject({ repo: slug, file: z.string() }).optional(),
              /** Deploy repos (no image): what the merge request pipeline's policy-check enforces (E7-03). */
              policies: z.array(z.enum(POLICIES)).default([]),
            }),
          )
          .default({}),
      })
      .superRefine((g, ctx) => {
        for (const [project, c] of Object.entries(g.ci)) {
          if (!Object.hasOwn(g.repos, project))
            ctx.addIssue({
              code: 'custom',
              path: ['ci', project],
              message: `no repo named ${project}`,
            })
          if (c.deploy && !c.image)
            ctx.addIssue({
              code: 'custom',
              path: ['ci', project, 'deploy'],
              message: 'only a project with an image can update a deploy repo',
            })
          if (c.deploy && !Object.hasOwn(g.repos, c.deploy.repo))
            ctx.addIssue({
              code: 'custom',
              path: ['ci', project, 'deploy', 'repo'],
              message: `no repo named ${c.deploy.repo}`,
            })
        }
        for (const [i, a] of g.applications.entries())
          if (!Object.hasOwn(g.repos, a.source.repo))
            ctx.addIssue({
              code: 'custom',
              path: ['applications', i, 'source', 'repo'],
              message: `no repo named ${a.source.repo}`,
            })
      })
      .optional(),
    /**
     * Telemetry (E8-01): the services that serve requests, what each calls, and how they behave when
     * healthy. Metrics, traces and correlated logs come from this plus the cluster's history.
     */
    telemetry: z
      .strictObject({
        /** How much the request rate swings over a day (0.3: ±30% around the average). */
        dailyAmplitude: z.number().min(0).max(0.9).default(0.3),
        services: z
          .array(
            z.strictObject({
              /** The Kubernetes Service. */
              name: slug,
              namespace: slug,
              cluster: slug.optional(),
              /** The Deployment behind it (default: the same name). */
              deployment: slug.optional(),
              /** Services it calls for each request, in order. */
              calls: z.array(slug).default([]),
              /** Its own median processing time. */
              latencyMs: z.number().positive().default(20),
              /** Requests per second arriving from outside (entry services only). */
              rps: z.number().nonnegative().optional(),
              /** Share of its own requests that fail when healthy. */
              errorRate: z.number().min(0).max(1).default(0.001),
              /** What its spans look like: an HTTP server, a database, a queue, a background worker. */
              kind: z.enum(['http', 'db', 'queue', 'worker']).default('http'),
              /** The route or statement its spans are named after. */
              operation: z.string().optional(),
              /**
               * A feature flag that makes it slow (E10-02): while the ConfigMap key has this value, each
               * request takes `latencyMs` longer (an N+1 query behind the flag, say).
               */
              slowWhen: z
                .strictObject({
                  configMap: z.string(),
                  key: z.string(),
                  equals: z.string(),
                  latencyMs: z.number().positive(),
                })
                .optional(),
            }),
          )
          .default([]),
      })
      .superRefine((t, ctx) => {
        const names = new Set(t.services.map((x) => x.name))
        t.services.forEach((x, i) => {
          x.calls.forEach((c, j) => {
            if (!names.has(c))
              ctx.addIssue({
                code: 'custom',
                path: ['services', i, 'calls', j],
                message: `no telemetry service named ${c}`,
              })
          })
        })
      })
      .optional(),
    /** How each image behaves when it runs (healthy if absent): crashes, memory use, log lines (E6-03). */
    images: z.record(z.string(), behaviourSchema).default({}),
    /**
     * The capstone's acts (E10-02), in order. Validated in full by the capstone engine
     * (src/sim/capstone/script.ts); here only their identity is checked.
     */
    acts: z.array(z.looseObject({ id: slug, title: z.string().min(1) })).default([]),
    /** Challenge IDs that use this scenario (resolved by the content build, E5-01/E6-10). */
    objectives: z.array(slug).default([]),
    /**
     * Files in the learner's home folder (E6-08), by path relative to it: `manifests/api.yaml`. Read-only;
     * `ls`, `cat` and `cd` browse them and `kubectl apply -f` reads them.
     */
    files: z
      .record(
        z
          .string()
          .regex(
            /^(?!\/)(?!.*\/\/)(?!.*(^|\/)\.\.?(\/|$))[\w.-]+(\/[\w.-]+)*$/,
            'a relative path like manifests/api.yaml',
          ),
        z.string(),
      )
      .default({}),
  })
  .superRefine((s, ctx) => {
    const clusterNames = new Set(s.clusters.map((c) => c.name))
    for (const [name, r] of Object.entries(s.gitops?.repos ?? {}))
      r.mirror.forEach((m, i) => {
        if (!clusterNames.has(m.cluster))
          ctx.addIssue({
            code: 'custom',
            path: ['gitops', 'repos', name, 'mirror', i, 'cluster'],
            message: `no cluster named ${m.cluster}`,
          })
      })
    const contextNames = new Set(s.contexts.map((c) => c.name))
    if (!contextNames.has(s.currentContext))
      ctx.addIssue({
        code: 'custom',
        path: ['currentContext'],
        message: `no context named "${s.currentContext}"`,
      })
    s.contexts.forEach((c, i) => {
      if (!clusterNames.has(c.cluster))
        ctx.addIssue({
          code: 'custom',
          path: ['contexts', i, 'cluster'],
          message: `no cluster named "${c.cluster}"`,
        })
    })
    const dupes = (names: string[]) => names.filter((n, i) => names.indexOf(n) !== i)
    for (const d of dupes(s.clusters.map((c) => c.name)))
      ctx.addIssue({ code: 'custom', path: ['clusters'], message: `duplicate cluster "${d}"` })
    for (const d of dupes(s.contexts.map((c) => c.name)))
      ctx.addIssue({ code: 'custom', path: ['contexts'], message: `duplicate context "${d}"` })

    s.clusters.forEach((c, ci) => {
      const keys = c.resources.map(
        (r) =>
          `${r.kind}/${r.kind === 'Namespace' ? '' : (r.metadata.namespace ?? 'default')}/${r.metadata.name}`,
      )
      for (const d of dupes(keys))
        ctx.addIssue({
          code: 'custom',
          path: ['clusters', ci, 'resources'],
          message: `duplicate resource ${d}`,
        })
      for (const d of dupes(c.nodes.map((n) => n.name)))
        ctx.addIssue({
          code: 'custom',
          path: ['clusters', ci, 'nodes'],
          message: `duplicate node "${d}"`,
        })
      if (!c.nodes.some((n) => n.role === 'worker'))
        ctx.addIssue({
          code: 'custom',
          path: ['clusters', ci, 'nodes'],
          message: 'needs at least one worker node',
        })
      c.podOverrides.forEach((o, oi) => {
        const d = c.resources.find(
          (r) =>
            r.kind === 'Deployment' &&
            r.metadata.name === o.deployment &&
            (r.metadata.namespace ?? 'default') === o.namespace,
        )
        const path = ['clusters', ci, 'podOverrides', oi]
        if (d?.kind !== 'Deployment') {
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'deployment'],
            message: `no Deployment ${o.namespace}/${o.deployment} in this cluster`,
          })
          return
        }
        if (o.replica >= d.spec.replicas)
          ctx.addIssue({
            code: 'custom',
            path: [...path, 'replica'],
            message: `${o.deployment} has ${String(d.spec.replicas)} replicas`,
          })
        for (const name of Object.keys(o.containers))
          if (!d.spec.template.spec.containers.some((k) => k.name === name))
            ctx.addIssue({
              code: 'custom',
              path: [...path, 'containers', name],
              message: `${o.deployment} has no container "${name}"`,
            })
      })
    })

    s.timeline.forEach((entry, i) => {
      const def = timelineEvent(entry.type)
      if (!def) {
        ctx.addIssue({
          code: 'custom',
          path: ['timeline', i, 'type'],
          message: `unknown timeline event "${entry.type}" (known: ${TIMELINE_EVENTS.map((e) => e.type).join(', ')})`,
        })
        return
      }
      if (entry.cluster !== undefined && !clusterNames.has(entry.cluster))
        ctx.addIssue({
          code: 'custom',
          path: ['timeline', i, 'cluster'],
          message: `no cluster named "${entry.cluster}"`,
        })
      const params = timelineParams(entry)
      const parsed = def.schema.safeParse(params)
      if (!parsed.success) {
        for (const issue of parsed.error.issues)
          ctx.addIssue({
            code: 'custom',
            path: ['timeline', i, ...issue.path],
            message: issue.message,
          })
        return
      }
      const target = s.clusters.find((c) => c.name === (entry.cluster ?? s.clusters[0]?.name))
      if (target) {
        for (const problem of def.check?.(parsed.data, target.resources) ?? [])
          ctx.addIssue({
            code: 'custom',
            path: ['timeline', i, ...problem.path],
            message: problem.message,
          })
      }
    })
  })

export type Scenario = z.output<typeof scenarioSchema>
export type ScenarioInput = z.input<typeof scenarioSchema>
export type ScenarioCluster = Scenario['clusters'][number]
export type Manifest = ScenarioCluster['resources'][number]
export type TimelineEntry = Scenario['timeline'][number]
