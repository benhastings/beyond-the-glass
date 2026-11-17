# E8 · Observability simulation: Prometheus, Grafana & OpenTelemetry
<!-- epic: milestone=M4; labels=area:o11y -->

**Goal:** Learners move fluidly from "something's wrong" on a dashboard to the exact slow span and the log line that explains it, using Grafana-style views fed by consistent synthetic telemetry.

**Epic success criteria**
- [ ] `SC1` Metrics, logs, traces, Kubernetes events and Argo history all derive from the same scenario timeline. A contract test asserts that an injected fault at T appears in each signal within its expected latency.
- [ ] `SC2` A learner can pivot metric → exemplar/trace → span → logs (by `trace_id`) and back in ≤ 3 interactions per hop, following the same Prometheus → Tempo → Loki correlations the team uses in Grafana
- [ ] `SC3` Every chart has an accessible data-table/summary alternative
- [ ] `SC4` Supported PromQL subset is documented, and unsupported syntax returns a clear message

---

## E8-01 · Telemetry generator: metrics, logs and traces from one timeline
<!-- meta: milestone=M4; size=L; labels=area:o11y,type:feature; depends=E6-03 -->

**Scope**
- Service topology model per scenario (e.g., `gate → ravenpost-api → ledger → postgres`; `ravenpost-api → queue → scribe`)
- Load model (requests/sec with daily shape + noise) → per-service RED metrics, using Prometheus naming conventions: `http_server_request_duration_seconds_bucket` (OTel semantic conventions), `http_server_requests_total`-style counters, plus kube-state-metrics/cAdvisor-style series (`kube_pod_container_status_restarts_total`, `container_memory_working_set_bytes`, `kube_deployment_status_replicas_available`)
- Faults modify telemetry: latency injection, error rate, memory growth to OOM, pod restarts, zero endpoints → 503s at the gate
- Traces as OTLP-shaped JSON (resource attributes, spans with `trace_id`/`span_id`/`parent_span_id`, attributes, events, status), sampled deterministically; exemplars linking histogram buckets to trace IDs
- Logs: structured JSON with `trace_id`/`span_id`, levels, and messages tied to faults
- Lazy, window-based generation (compute only the queried range) so memory stays bounded

**Acceptance criteria**
- [ ] `AC1` Generating 6 h of 15 s-resolution metrics for 6 services takes < 200 ms in the browser
- [ ] `AC2` Contract test: OOM fault at T → memory series hits limit at T, restart counter increments at T+δ, `kubectl get pods` shows the restart, log shows the last line before kill, traces show errors/gaps in that window
- [ ] `AC3` Deterministic for a given seed

---

## E8-02 · Grafana-style dashboards
<!-- meta: milestone=M4; size=L; labels=area:o11y,type:feature; depends=E8-01,E1-03,E0-07 -->

**Scope**
- Dashboard shell: time range picker (last 15m/1h/6h, custom), refresh, variables (namespace, service), panel grid
- Panel types: time series (with thresholds and deploy annotations from Argo sync events), stat, gauge, table, logs panel
- Shipped dashboards: **Service Overview (RED)**, **Kubernetes Workloads**, **Ravenpost SLO**
- "Explore" button on panels opens E8-03 with the panel's query

**Acceptance criteria**
- [ ] `AC1` Every panel has a "View as table" toggle and an auto-generated text summary ("p99 latency for ravenpost-api rose from 120 ms to 2.4 s at 21:14")
- [ ] `AC2` Deploy annotations line up with Argo history timestamps (contract test)
- [ ] `AC3` Panels render 6 h of data in < 100 ms each
- [ ] `AC4` Visually evokes Grafana's dark theme layout **without Grafana logos/branding**

---

## E8-03 · PromQL explorer (subset)
<!-- meta: milestone=M4; size=L; labels=area:o11y,type:feature; depends=E8-01 -->

**Scope**
- Parser and evaluator for: instant/range vector selectors with `=`, `!=`, `=~`, `!~`; `rate`, `irate`, `increase`, `sum/avg/max/min/count by|without`, `histogram_quantile`, `topk`, binary arithmetic and comparison operators with scalars, offset
- Query library of 15–20 starter queries with plain-English explanations (shared with E2-07 cheat sheet)
- Results as graph + table; errors quote the unsupported token

**Acceptance criteria**
- [ ] `AC1` Evaluator results for the starter queries match hand-computed expected values on fixture series (tests)
- [ ] `AC2` Unsupported functions return `"<fn>" isn't available in this simulation — try …` rather than a generic error
- [ ] `AC3` Query editor is a labeled text field with optional autocomplete of metric and label names (accessible combobox)

---

## E8-04 · Logs explorer (Loki)
<!-- meta: milestone=M4; size=M; labels=area:o11y,type:feature; depends=E8-01 -->

**Scope**
- Styled after Grafana Explore with a Loki data source. LogQL subset: label selectors (`{namespace="ravenpost", app="ledger"}`), line filters (`|=`, `!=`, `|~`), `| json` with field filters
- Log volume histogram; expandable lines showing parsed fields; `trace_id` rendered as a link to the trace viewer (mirrors Loki **derived fields** → Tempo)

**Acceptance criteria**
- [ ] `AC1` Query results are consistent with `kubectl logs` for the same pod and window (contract test with E6-06)
- [ ] `AC2` Clicking a `trace_id` opens that trace with the related span highlighted
- [ ] `AC3` Log list is virtualized and stays usable with 10k lines; it remains screen-reader navigable (list semantics, line count announced)

---

## E8-05 · Trace viewer (Tempo)
<!-- meta: milestone=M4; size=L; labels=area:o11y,type:feature; depends=E8-01 -->

**Scope**
- Styled after Grafana Explore with a Tempo data source: search form (service, span name, status, min/max duration, time range) **and a TraceQL subset**: `{ resource.service.name = "ledger" && duration > 500ms }`, `status = error`, `span.http.response.status_code >= 500`, `&&`/`||`, and the `>>` (descendant) structural operator
- Exemplars on latency panels (E8-02) open the linked trace, as Prometheus exemplars → Tempo do
- Waterfall view: span bars with durations, service colors + labels, errors marked, collapsible children; span detail (attributes, resource attributes, events, status)
- "Logs for this span" link (filters logs by `trace_id` + `span_id`, mirroring Tempo's trace-to-logs link to Loki)
- Mini service graph showing the call path for the trace

**Acceptance criteria**
- [ ] `AC1` Waterfall is navigable as a tree (WAI-ARIA tree pattern) with a table alternative (span, service, start offset, duration, status)
- [ ] `AC2` The slowest span and error spans can be jumped to with keyboard shortcuts, with on-screen hints
- [ ] `AC3` Renders a 200-span trace in < 50 ms
- [ ] `AC4` The TraceQL subset returns the expected trace IDs for a table of fixture queries; unsupported TraceQL returns a message quoting the unsupported part

---

## E8-06 · Interactive OTel pipeline explainer
<!-- meta: milestone=M4; size=M; labels=area:o11y,type:feature; depends=E5-02,E8-01 -->

**Scope**
- Interactive diagram: app SDK (auto + manual instrumentation) → OTLP → Collector (receivers → processors: batch, memory_limiter, k8sattributes → exporters) → Prometheus / trace store / log store
- Toggles that break things and show the effect on the trace viewer: missing context propagation (broken traces), exporter misconfigured (no data), sampling too aggressive, missing `k8sattributes` (no pod labels)
- Collector YAML pane updates live with each toggle

**Acceptance criteria**
- [ ] `AC1` Each toggle's effect is visible in the embedded mini trace view and described in text
- [ ] `AC2` Diagram is keyboard navigable; each node has an accessible description
- [ ] `AC3` Collector YAML shown is valid OTel Collector config (validated against a schema/fixture)

---

## E8-07 · Alerts and SLOs
<!-- meta: milestone=M4; size=M; labels=area:o11y,type:feature; depends=E8-02,E8-03 -->

**Scope**
- Alert rules view (PromQL expr, `for`, labels, annotations with runbook link); firing/pending/inactive states driven by the timeline
- SLO panel: availability and latency SLOs, error budget remaining, burn rate (multi-window) explained in ELI5 and Operator layers
- A "pager" notification that kicks off scenarios (reduced-motion aware, no sound by default)

**Acceptance criteria**
- [ ] `AC1` Alert state transitions match evaluating the rule expression over the generated series (test)
- [ ] `AC2` Burn-rate math verified with a worked example test
