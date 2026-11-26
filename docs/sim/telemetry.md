# Telemetry (E8-01)

Metrics, traces and logs come from one place: the scenario's **topology** (`telemetry:`) plus the cluster's
**history**. Nothing random and nothing stored per sample. Everything is computed for the window asked for,
so 6 hours of 15-second metrics for six services take well under 200 ms.

## Topology

```yaml
telemetry:
  dailyAmplitude: 0.3 # request rate swings ±30% over the day (by the scenario clock)
  services:
    - { name: gate, namespace: ravenpost, calls: [api], latencyMs: 8, rps: 40, operation: GET /messages }
    - { name: api, namespace: ravenpost, calls: [ledger, queue], latencyMs: 25 }
    - { name: ledger, namespace: ravenpost, calls: [postgres], latencyMs: 15 }
    - { name: postgres, namespace: ravenpost, kind: db, latencyMs: 6, operation: SELECT messages }
    - { name: queue, namespace: ravenpost, kind: queue, latencyMs: 2 }
    - { name: scribe, namespace: ravenpost, kind: worker, calls: [postgres], rps: 5 }
```

`name` is the Kubernetes Service; `deployment` defaults to the same name. Entry services (with `rps`, or
called by nobody) receive outside traffic; it flows down `calls`.

## History

`src/sim/telemetry/history.ts` is the last controller. On every reconcile it records:

- every container run, and how it ended (`OOMKilled`, `Error`, `Deleted`, …)
- step series for restarts, available replicas, ready endpoints, and each Service's injected latency,
  errors and request rate

The simulator is discrete-event, so this is exact, and it grows only with change. It's part of the
snapshot.

## The service model (`model.ts`)

For every 15-second bucket, each service has:

- **A request rate.** The entry rate, times the daily shape, times ±8% seeded noise. Callees inherit their
  callers' rate.
- **A failure share.** Its own error rate, plus `injectErrors`, plus 5% in a bucket where a pod restarted,
  combined with its calls' failure shares. No ready endpoints means 100% failures (503).
- **A median latency.** Its own latency, plus `injectLatency`, plus its calls' latency. Latencies are
  log-normal (σ 0.5) around that median.

## Metrics (`metrics.ts`)

| Metric | Labels |
|---|---|
| `http_server_requests_total` | `cluster`, `namespace`, `service`, `http_response_status_code` (200, 500, 503) |
| `http_server_request_duration_seconds_bucket` / `_sum` / `_count` | `…`, `le` (OpenTelemetry's boundaries, in seconds) |
| `kube_pod_container_status_restarts_total` | `cluster`, `namespace`, `pod`, `container` |
| `container_memory_working_set_bytes` | same; the peak in each scrape interval, capped at the limit |
| `kube_pod_container_resource_limits` | same, plus `resource="memory"`, `unit="byte"` |
| `kube_deployment_status_replicas_available` | `cluster`, `namespace`, `deployment` |

Counters count from six hours before the scenario starts, so every window agrees. A run killed for memory
climbs to its limit and is killed there. The restart counter goes up when the kubelet restarts the
container, after its back-off.

`rangeSeries(sim, start, end, step, names)` and `instantSeries(sim, t, names)` are the API that PromQL
(E8-03) and dashboards (E8-02) build on.

## Traces (`traces.ts`)

- **Sampling:** one sampled request per entry service per 15-second bucket.
- **Trace IDs:** 32 hex characters. An ID encodes its bucket and entry service, so `trace(sim, id)`
  rebuilds any trace.
- **Spans:**
  - Each span is served by a pod that was running at that moment (`k8s.pod.name`).
  - Its own time is sampled from the service's latency.
  - Its calls run in order.
  - A service with no ready endpoints fails the call with a 503 ("no endpoints available for service …"),
    and the trace stops there.
- **Export:** `toOtlp` gives OTLP JSON (`resourceSpans` → `scopeSpans` → `spans`).
- **Exemplars:** `exemplars(sim, service, start, end)` links latency samples to traces.

## Logs

With a topology, a container's request log lines describe the spans that pod served. They carry the
span's status, duration, `trace_id` and `span_id`, so a log line's trace always resolves. Without a
topology, request lines are as before.

## Faults

| Fault | What changes |
|---|---|
| `injectLatency` | The service's latency, and its callers' (metrics, spans) |
| `injectErrors` | A share of its requests fail with 500 (metrics, spans, logs) |
| `setMemoryLimit`, or `memoryMi` above the limit | OOMKilled runs: memory reaches the limit, restarts go up, `kubectl` shows it, `--previous` logs end before the kill |
| No ready endpoints (a crash, a bad selector) | 503s for every call to it, and errors up the call path |

## Dashboards (E8-02)

`src/sim/dashboards/dashboards.ts` defines the shipped dashboards as data: each panel's PromQL, type,
unit, description and thresholds. `$service` and `$namespace` take the variables' values, with "All"
meaning `.*`. The dashboards are:

- **Service Overview (RED):** stat panels for the error ratio, p99 and rate now; time series for rate,
  errors and p99, with deploy markers; and a table of requests by status.
- **Kubernetes Workloads:** a gauge for the container closest to its memory limit; stats for Deployments
  with nothing available and restarts; available replicas and memory per pod; a restarts table; and
  recent error logs.
- **Ravenpost SLO:** availability and requests-within-500-ms stats against the objectives (99.9%, 95%),
  and the gate's error ratio and p95 over time.

How they get their data (`data.ts`):

- `windowSource` fetches every series for the window once, and all of a dashboard's panels share it. Each
  panel's 6 hours of data is then ready in well under 100 ms.
- `deployAnnotations` gives the deploy markers: Argo CD's sync history, one marker per sync.

The UI is `src/app/o11y/dashboards/`. It has a dashboard picker, variables, a time range (including a
custom one), Refresh, and a 12-column grid. Every panel has a "View as table" toggle and a sentence that
says what it shows. Explore opens the panel's query in the PromQL explorer. The layout evokes Grafana's,
with no Grafana logo or branding.

## Traces and TraceQL (E8-05)

`src/sim/traceql/traceql.ts` supports this subset of TraceQL:

| Supported | Examples |
|---|---|
| Spanset filters on intrinsics: `name`, `status` (`error`, `ok`, `unset`), `duration` (`ns`, `us`, `ms`, `s`, `m`, `h`), `kind` | `{ status = error }`, `{ duration > 500ms }` |
| Span attributes, resource attributes, or either | `{ span.http.response.status_code >= 500 }`, `{ resource.service.name = "ledger" }`, `{ .service.name = "api" }` |
| `= != > >= < <= =~ !~`, `&&`, `\|\|`, parentheses | `{ (status = error \|\| duration >= 1s) && resource.service.name !~ "gate" }` |
| The descendant operator `>>`, which returns the matching descendants | `{ resource.service.name = "api" } >> { status = error }` |

Pipelines (`| count()`, `| select(…)`), other structural operators (`>`, `<`, `~`) and `&&` between
spansets are refused with a message that quotes them and says what to try.

The explorer (`src/app/o11y/traces/`) has:

- a search form that writes TraceQL, a TraceQL field, and the matching traces, newest first
- the waterfall, a WAI-ARIA tree with a table alternative
- **S** to jump to the slowest span (by its own time) and **E** to jump to the next error, with on-screen
  hints and buttons
- the call path between services
- each span's attributes, resource attributes, events and status
- a "Logs for this span" hook

## Logs and LogQL (E8-04)

`src/sim/logql/logql.ts` queries the same lines `kubectl logs` reads (`logsInWindow`), so the two always
agree. It supports this subset of LogQL:

| Supported | Examples |
|---|---|
| A stream selector over `cluster`, `namespace`, `pod`, `container` and `app`, with `= != =~ !~` | `{namespace="ravenpost", app=~"api\|gate"}` |
| Line filters | `\|= "timeout"`, `!= "healthz"`, `\|~ "5\\d\\d"`, `!~ "debug"` |
| `\| json`, then field filters with `= != =~ !~` (strings) or `> >= < <= =` (numbers) | `\| json \| level="error" \| duration_ms > 500` |

Metric queries (`rate(…)`, `count_over_time(…)`), other parsers (`logfmt`, `pattern`) and formatting stages
are refused with a message that quotes them and says what to try.

The logs explorer (`src/app/o11y/logs/`) has:

- the log volume over the range, with a sentence saying when it was busiest
- the lines, newest first, in a virtualised list: only the lines in view are rendered, and each says it is
  line n of N; Up/Down, Page Up/Down, Home and End move between lines
- each line's parsed fields
- a trace ID button that opens the trace at that line's span

`ObservabilityWorkspace` puts Dashboards, Metrics, Logs and Traces on one simulation, linked as in Grafana:

- A latency panel's slowest sampled requests open their traces (exemplars).
- A log line's trace ID opens the trace at its span (Loki → Tempo).
- "Logs for this span" opens that pod's lines for the trace (Tempo → Loki).

## Alerts and SLOs (E8-07)

`src/sim/alerts/rules.ts` holds the alert rules: their PromQL, `for`, severity, summary, what to do, and a
runbook. They are:

- `RavenpostHighErrorRate` (page)
- `RavenpostHighLatency`
- `KubeDeploymentReplicasUnavailable` (page)
- `KubePodCrashLooping`
- `ContainerMemoryNearLimit`

`evaluateRules` runs them as Prometheus does: every 30 seconds, an alert is pending while its expression
returns a series, firing once it has held for `for`, and inactive when it stops returning.

`src/sim/alerts/slo.ts` does the SRE workbook's arithmetic:

- error budget = 1 − objective
- burn rate = error ratio ÷ budget
- budget consumed and time until the budget runs out
- the multi-window, multi-burn-rate alerts:
  - page on 14.4× over 1 h and 5 m
  - page on 6× over 6 h and 30 m
  - ticket on 1× over 3 d and 6 h

The workspace's **Alerts** tab shows:

- each rule's state (as an icon and a word), the alerts it has active, its expression and runbook, and its
  changes over the last hour
- the gate's availability SLO: success ratio and burn rate over 5 m, 30 m, 1 h and 6 h; the budget spent;
  and explanations at the ELI5 and Operator levels

The **pager** is a banner for page-severity alerts that are firing. It plays no sound, pulses only when
the reader allows motion, and stays hidden after it's acknowledged until a new page arrives.

## The OpenTelemetry pipeline explainer (E8-06)

The lesson component `<OtelPipeline />` (`src/app/o11y/otel/`, model in `src/sim/otel/pipeline.ts`) shows the
path: SDK → OTLP → Collector (receivers → processors → exporters) → Prometheus, the trace store and the log
store. The diagram is a row of steps; arrow keys move between them, and each step has a description.

Four switches break the pipeline the ways teams really do. Each changes what reaches the trace store (from
the last 100 requests) and the explanation:

| Switch | What happens |
|---|---|
| The SDK doesn't pass trace context | Each service's span is its own trace: 300 one-span traces, no call chain |
| The traces exporter's endpoint is misspelled | No traces at all; the Collector logs "Exporting failed. Dropping data." Metrics and logs still arrive. |
| 1% sampling (`probabilistic_sampler`) | One trace in a hundred: rare slow or failing requests are likely gone |
| No `k8sattributes` processor | Spans have no pod or namespace, so you can't get from a span to its pod or logs |

The Collector config shown updates with each switch. `validateCollectorConfig` checks every combination
the way the Collector does at startup:

- each section's shape
- that component types are known
- that every component a pipeline names is configured
- `memory_limiter` first and `batch` last
