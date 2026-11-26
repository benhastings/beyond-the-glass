import { parse, stringify } from 'yaml'
import { z } from 'zod'

/**
 * The OpenTelemetry pipeline explainer (E8-06): an app's SDK sends OTLP to a Collector (receivers →
 * processors → exporters), which sends metrics, traces and logs on to their stores. Four switches break it
 * in the ways teams really do; for each, what reaches the trace store changes, and the Collector config
 * shown is the one that would do it.
 */
export interface PipelineConfig {
  /** The SDK passes trace context on to the services it calls (W3C traceparent). */
  propagation: boolean
  /** The traces exporter points at the trace store. */
  exporterOk: boolean
  /** Share of traces kept: 1 (all), or 0.01 (one in a hundred). */
  sampling: 1 | 0.01
  /** The k8sattributes processor adds pod, namespace and Deployment to every span. */
  k8sattributes: boolean
}

export const HEALTHY: PipelineConfig = {
  propagation: true,
  exporterOk: true,
  sampling: 1,
  k8sattributes: true,
}
const TEMPO = 'tempo.observability.svc.cluster.local:4317'
const WRONG = 'tempo.observabilty.svc.cluster.local:4317'

/** The Collector's config for this pipeline, as YAML. */
export function collectorConfig(c: PipelineConfig): string {
  const processors = [
    'memory_limiter',
    ...(c.k8sattributes ? ['k8sattributes'] : []),
    ...(c.sampling < 1 ? ['probabilistic_sampler'] : []),
    'batch',
  ]
  const doc = {
    receivers: {
      otlp: {
        protocols: { grpc: { endpoint: '0.0.0.0:4317' }, http: { endpoint: '0.0.0.0:4318' } },
      },
    },
    processors: {
      memory_limiter: { check_interval: '1s', limit_percentage: 80, spike_limit_percentage: 20 },
      ...(c.k8sattributes
        ? {
            k8sattributes: {
              extract: {
                metadata: [
                  'k8s.namespace.name',
                  'k8s.pod.name',
                  'k8s.deployment.name',
                  'k8s.node.name',
                ],
              },
            },
          }
        : {}),
      ...(c.sampling < 1
        ? { probabilistic_sampler: { sampling_percentage: c.sampling * 100 } }
        : {}),
      batch: { send_batch_size: 1024, timeout: '5s' },
    },
    exporters: {
      'otlp/tempo': { endpoint: c.exporterOk ? TEMPO : WRONG, tls: { insecure: true } },
      prometheusremotewrite: {
        endpoint: 'http://prometheus.observability.svc.cluster.local:9090/api/v1/write',
      },
      'otlphttp/loki': { endpoint: 'http://loki.observability.svc.cluster.local:3100/otlp' },
    },
    service: {
      pipelines: {
        traces: { receivers: ['otlp'], processors, exporters: ['otlp/tempo'] },
        metrics: {
          receivers: ['otlp'],
          processors: processors.filter((p) => p !== 'probabilistic_sampler'),
          exporters: ['prometheusremotewrite'],
        },
        logs: {
          receivers: ['otlp'],
          processors: processors.filter((p) => p !== 'probabilistic_sampler'),
          exporters: ['otlphttp/loki'],
        },
      },
    },
  }
  return stringify(doc, { lineWidth: 0 })
}

/** Component types this explainer uses, and what each is (the Collector's registry, for these). */
const KNOWN = {
  receivers: ['otlp'],
  processors: ['memory_limiter', 'batch', 'k8sattributes', 'probabilistic_sampler'],
  exporters: ['otlp', 'otlphttp', 'prometheusremotewrite'],
} as const
const hostPort = z
  .string()
  .regex(/^(https?:\/\/)?[a-z0-9.-]+:\d{2,5}(\/[\w/.-]*)?$/, 'an endpoint like host:4317')
const configSchema = z.strictObject({
  receivers: z.record(
    z.string(),
    z.strictObject({
      protocols: z.strictObject({
        grpc: z.strictObject({ endpoint: hostPort }).optional(),
        http: z.strictObject({ endpoint: hostPort }).optional(),
      }),
    }),
  ),
  processors: z.record(z.string(), z.record(z.string(), z.unknown())),
  exporters: z.record(z.string(), z.looseObject({ endpoint: hostPort })),
  service: z.strictObject({
    pipelines: z.record(
      z.enum(['traces', 'metrics', 'logs']),
      z.strictObject({
        receivers: z.array(z.string()).min(1),
        processors: z.array(z.string()).default([]),
        exporters: z.array(z.string()).min(1),
      }),
    ),
  }),
})

/**
 * Checks a Collector config the way the Collector does when it starts: the shape of each section, known
 * component types, every component a pipeline names is configured, and (the documented best practice)
 * memory_limiter first and batch last. Returns the problems; none means valid.
 */
export function validateCollectorConfig(yaml: string): string[] {
  let doc: unknown
  try {
    doc = parse(yaml)
  } catch (e) {
    return [`not YAML: ${(e as Error).message}`]
  }
  const r = configSchema.safeParse(doc)
  if (!r.success) return r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  const c = r.data
  const problems: string[] = []
  const type = (id: string) => id.split('/')[0] ?? id
  for (const [section, names] of [
    ['receivers', Object.keys(c.receivers)],
    ['processors', Object.keys(c.processors)],
    ['exporters', Object.keys(c.exporters)],
  ] as const)
    for (const n of names)
      if (!(KNOWN[section] as readonly string[]).includes(type(n)))
        problems.push(`${section}: unknown type "${type(n)}"`)
  for (const [name, p] of Object.entries(c.service.pipelines)) {
    for (const x of p.receivers)
      if (!Object.hasOwn(c.receivers, x))
        problems.push(`service.pipelines.${name}: receiver "${x}" isn't configured`)
    for (const x of p.processors)
      if (!Object.hasOwn(c.processors, x))
        problems.push(`service.pipelines.${name}: processor "${x}" isn't configured`)
    for (const x of p.exporters)
      if (!Object.hasOwn(c.exporters, x))
        problems.push(`service.pipelines.${name}: exporter "${x}" isn't configured`)
    if (p.processors.includes('memory_limiter') && p.processors[0] !== 'memory_limiter')
      problems.push(`service.pipelines.${name}: memory_limiter should come first`)
    if (p.processors.includes('batch') && p.processors.at(-1) !== 'batch')
      problems.push(`service.pipelines.${name}: batch should come last`)
  }
  return problems
}

/** One span as the trace store would have it. */
export interface MiniSpan {
  service: string
  name: string
  traceId: string
  parent?: string
  pod?: string
}

/** What reached the trace store from 100 requests through gate → api → ledger, and what it means. */
export interface Effect {
  /** Traces stored, each a list of spans. */
  traces: MiniSpan[][]
  /** Of the 100 requests, how many were stored. */
  kept: number
  /** A line from the Collector's own log, if it's complaining. */
  collectorLog?: string
  /** What changed, in words. */
  explanation: string[]
}

const PATH = [
  ['gate', 'GET /messages', 'gate-6c9f7d-2xk4p'],
  ['api', 'GET /messages', 'api-5d8b9c-q7m2n'],
  ['ledger', 'GET /ledger', 'ledger-7f6d5b-h3j8k'],
] as const

const hex = (n: number, w: number) => (n >>> 0).toString(16).padStart(w, '0').slice(-w)
const tid = (i: number, part = 0) =>
  `${hex(0x9e3779b1 * (i + 1), 8)}${hex(0x85ebca6b * (i + 7 + part), 8)}${hex(i * 977 + part, 16)}`

export function effect(c: PipelineConfig): Effect {
  const explanation: string[] = []
  if (!c.exporterOk) {
    return {
      traces: [],
      kept: 0,
      collectorLog: `error\texporterhelper/queue_sender.go:92\tExporting failed. Dropping data.\t{"kind": "exporter", "data_type": "traces", "name": "otlp/tempo", "error": "rpc error: code = Unavailable desc = name resolver error: produced zero addresses", "dropped_items": 512}`,
      explanation: [
        'No traces arrive: the exporter points at a host that doesn’t exist (tempo.observabilty… is misspelled).',
        'The apps are fine and the Collector receives everything; it drops the data on the way out. Its own log says so: “Exporting failed. Dropping data.”',
        'Metrics and logs still arrive: each signal has its own pipeline and exporter.',
      ],
    }
  }
  const keptIdx = Array.from({ length: 100 }, (_, i) => i).filter(
    (i) => c.sampling >= 1 || i % Math.round(1 / c.sampling) === 42 % Math.round(1 / c.sampling),
  )
  const traces = keptIdx.map((i) =>
    PATH.map(([service, name, pod], depth) => ({
      service,
      name,
      // Without propagation, each service starts its own trace.
      traceId: c.propagation ? tid(i) : tid(i, depth + 1),
      ...(c.propagation && depth > 0 ? { parent: PATH[depth - 1]?.[0] } : {}),
      ...(c.k8sattributes ? { pod } : {}),
    })),
  )
  const stored = c.propagation ? traces : traces.flatMap((t) => t.map((s) => [s]))
  if (c.sampling < 1)
    explanation.push(
      `Only ${String(keptIdx.length)} of the last 100 requests were kept: the sampler keeps ${String(c.sampling * 100)}%. A rare slow or failing request will probably not be among them; keep errors and slow traces with tail sampling, or sample less.`,
    )
  if (!c.propagation)
    explanation.push(
      'Each service’s span is its own trace: the SDK isn’t passing the traceparent header on, so the api and ledger don’t know which request they’re part of. The waterfall can’t show the call chain.',
    )
  if (!c.k8sattributes)
    explanation.push(
      'Spans have no pod or namespace: without the k8sattributes processor, nothing adds them, so you can’t go from a slow span to the pod that served it (or its logs).',
    )
  if (explanation.length === 0)
    explanation.push(
      'Every request arrives as one trace across gate, api and ledger, with each span’s pod attached.',
    )
  return { traces: stored, kept: keptIdx.length, explanation }
}

/** The diagram's nodes, in the order data flows, each with what it does. */
export const NODES = [
  {
    id: 'sdk',
    title: 'App + SDK',
    detail:
      'The OpenTelemetry SDK in each service: automatic instrumentation for HTTP and database calls, plus manual spans for the app’s own work. It passes trace context on to the services it calls.',
  },
  {
    id: 'otlp',
    title: 'OTLP',
    detail:
      'The OpenTelemetry protocol: the SDK sends spans, metrics and logs to the Collector over gRPC (port 4317) or HTTP (port 4318).',
  },
  {
    id: 'receivers',
    title: 'Receivers',
    detail: 'Where data enters the Collector. The otlp receiver accepts what the SDKs send.',
  },
  {
    id: 'processors',
    title: 'Processors',
    detail:
      'Work done in order on everything passing through: memory_limiter (refuse data before running out of memory), k8sattributes (add pod, namespace and Deployment), a sampler if there is one, and batch (send in groups).',
  },
  {
    id: 'exporters',
    title: 'Exporters',
    detail:
      'Where data leaves: traces to the trace store, metrics to Prometheus, logs to the log store. Each signal has its own pipeline.',
  },
  {
    id: 'stores',
    title: 'Prometheus, trace store, log store',
    detail: 'Where you query it: PromQL for metrics, TraceQL for traces, LogQL for logs.',
  },
] as const
