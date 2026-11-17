# E6 · Cluster simulator & the kubectl terminal
<!-- epic: milestone=M2; labels=area:sim -->

**Goal:** A deterministic, in-browser Kubernetes simulation, realistic enough that habits transfer to a real cluster, behind an accessible terminal.

**Epic success criteria**
- [ ] `SC1` Supported command matrix (documented in `docs/sim/support-matrix.md`) is fully implemented, and every command has golden-output tests
- [ ] `SC2` Output formats (columns, headers, spacing, status strings, event reasons) match fixtures captured from a real kind cluster (E6-11)
- [ ] `SC3` All six core failure states are simulated with correct `get`/`describe`/`events`/`logs` evidence: CrashLoopBackOff, ImagePullBackOff/ErrImagePull, OOMKilled, Pending (insufficient resources), readiness failing → no endpoints, CreateContainerConfigError (missing ConfigMap/Secret key)
- [ ] `SC4` Same scenario + same seed + same command sequence → byte-identical output (determinism test)
- [ ] `SC5` Unsupported commands always return a helpful message; nothing throws to the UI

---

## E6-01 · Simulator core: state model, clock, RNG and scenario loader
<!-- meta: milestone=M1; size=M; labels=area:sim,type:feature; depends=E0-01 -->

**Scope**
- Typed resource model (subset of real K8s fields, same names): Namespace, Node, Deployment, ReplicaSet, Pod (containers, statuses, restartCount, lastState), Service, Endpoints/EndpointSlice view, ConfigMap, Secret (values always shown redacted), Event
- `SimClock` (simulated time, advanced by commands and timeline), seeded RNG (e.g., mulberry32)
- Pod/ReplicaSet name generation that looks real (hash suffixes) and is deterministic
- **Scenario schema** (`src/scenarios/*.yaml`): initial resources, timeline events (`at: +4m, type: setImage | deleteConfigKey | setMemoryLimit | injectLatency | load | ...`), objectives references, contexts/clusters
- Snapshot/restore (JSON-serializable) for progress persistence

**Acceptance criteria**
- [ ] `AC1` Zero React/DOM imports (lint rule from E0-01 enforced)
- [ ] `AC2` Snapshot → restore → continue produces identical results to an uninterrupted run (test)
- [ ] `AC3` Scenario YAML validated with Zod; invalid scenarios fail the build
- [ ] `AC4` Includes the `ravenpost` baseline scenario used by E5-07 (healthy except one pod)

---

## E6-02 · Workload controllers and pod lifecycle
<!-- meta: milestone=M2; size=L; labels=area:sim,type:feature; depends=E6-01 -->

**Scope**
- Deployment → ReplicaSet → Pods reconciliation, including rolling updates (`maxSurge`/`maxUnavailable`), revision history, and `rollout undo`
- Pod phases and container states: Pending → ContainerCreating → Running/Ready; Terminating; Completed
- Probes: readiness gates Ready; liveness failures cause restarts
- Restart backoff timing that resembles kubelet (10s, 20s, 40s… capped at 5m)
- Node capacity and requests-based scheduling (enough to produce Pending with `Insufficient cpu/memory`)

**Acceptance criteria**
- [ ] `AC1` Rolling update from v1 → v2 with 3 replicas produces the same ReplicaSet scaling sequence as real Kubernetes for default strategy (test against a documented expected sequence)
- [ ] `AC2` Restart counts and backoff match the documented schedule (tests advance the clock)
- [ ] `AC3` ≥ 90% coverage

---

## E6-03 · Failure modes, events and endpoints
<!-- meta: milestone=M2; size=M; labels=area:sim,type:feature; depends=E6-02 -->

**Scope**
- Fault injectors used by scenario timelines: bad image tag (ErrImagePull → ImagePullBackOff), crash on start with exit code + log line (CrashLoopBackOff), memory exceeding limit (OOMKilled, exit 137), missing ConfigMap/Secret key (CreateContainerConfigError), readiness probe path wrong (not Ready → Service has no endpoints), insufficient resources (Pending + FailedScheduling event)
- Event stream with realistic `reason`, `message`, `type`, `count`, `firstTimestamp`/`lastTimestamp` aggregation
- Endpoints derived from Ready pods matching the Service selector; selector mismatch scenario supported

**Acceptance criteria**
- [ ] `AC1` For each fault, a test asserts the exact evidence across `get pods`, `describe pod` (State/Last State/Events section) and `get events`, matching E6-11 fixtures in structure
- [ ] `AC2` Event messages use the real wording for these reasons (e.g., `Back-off restarting failed container`, `0/3 nodes are available: 3 Insufficient memory.`)

---

## E6-04 · Command parser, registry and shell built-ins
<!-- meta: milestone=M1; size=M; labels=area:sim,type:feature; depends=E6-01 -->

**Scope**
- Tokenizer handling quotes, `--flag=value`, `--flag value`, short flags, combined `-it`, and `|` piping to `grep`, `head`, `tail`, `wc -l` (a small built-in subset only)
- Registry: each command (`kubectl get`, `kubectl describe`, `argocd app get`, …) is its own module exporting `{ match, run, complete, help }`
- Global kubectl flags: `-n/--namespace`, `-A/--all-namespaces`, `--context`, `-o`, `-l/--selector`
- Built-ins: `help`, `hint`, `clear`, `history`, `whoami` (in-world flavor), `exit` (closes the terminal panel)
- Errors mirror real kubectl (`error: the server doesn't have a resource type "pdos"`) plus a sim hint ("Did you mean `pods`?")
- **First command shipped here:** `kubectl get pods` (table output, `-n`, `-A`) to unblock M1

**Acceptance criteria**
- [ ] `AC1` Parser fuzz test: 10,000 random inputs never throw
- [ ] `AC2` "Did you mean" suggestions for resource names and verbs within edit distance 2
- [ ] `AC3` Unsupported but real commands (e.g., `kubectl port-forward`) return an in-world explanation of what it would do and suggest an alternative
- [ ] `AC4` Adding a new command requires no edits outside its own file and one registry line

---

## E6-05 · kubectl get and describe
<!-- meta: milestone=M2; size=L; labels=area:sim,type:feature; depends=E6-04,E6-03 -->

**Scope**
- `get` for pods, deployments, replicasets, services, endpoints, nodes, namespaces, configmaps, secrets, events; short names (`po`, `deploy`, `rs`, `svc`, `ep`, `no`, `ns`, `cm`, `ev`)
- Output: default table, `-o wide`, `-o yaml`, `-o json`, `-o name`, `--show-labels`, `-l` selectors (equality and set-based), `--sort-by=.lastTimestamp` for events, `-w` (watch shows timeline updates for a bounded period)
- `describe` for pod, deployment, service, node, with real section layout including Events
- AGE column computed from the sim clock in kubectl's format (`45s`, `3m12s`, `2d4h`)

**Acceptance criteria**
- [ ] `AC1` Golden-file tests for every resource × output format combination listed above
- [ ] `AC2` Column widths and alignment match kubectl's tabwriter behavior (verified against E6-11 fixtures)
- [ ] `AC3` `-o yaml` output is valid YAML that round-trips through a YAML parser

---

## E6-06 · kubectl logs, events and top
<!-- meta: milestone=M2; size=M; labels=area:sim,type:feature; depends=E6-04,E6-03 -->

**Scope**
- `logs <pod>` with `-c`, `--previous`, `--tail`, `--since`, `-f` (streams timeline logs for a bounded period), `deploy/<name>`, `-l` selector
- Log lines sourced from the telemetry generator interface (stub until E8-01; structured JSON lines with `trace_id` when the scenario provides them)
- `kubectl events` (newer form) and `get events`; `top pods`/`top nodes` from scenario resource usage

**Acceptance criteria**
- [ ] `AC1` `--previous` returns the crashed container's last log lines (essential for CrashLoopBackOff teaching), and errors correctly when there is no previous container
- [ ] `AC2` Multi-container pod without `-c` returns the real kubectl error message
- [ ] `AC3` Logs for a given pod are identical to what E8-04's log explorer shows for the same time window (contract test once E8-01 lands)

---

## E6-07 · kubectl rollout, scale, delete and set image
<!-- meta: milestone=M2; size=M; labels=area:sim,type:feature; depends=E6-04,E6-02 -->

**Scope:** `rollout status|history|undo|restart`, `scale`, `delete pod|deploy`, `set image`, `label`, `annotate`, each with realistic confirmation output.

**Acceptance criteria**
- [ ] `AC1` `rollout status` blocks (in sim time) and reports progress lines like real kubectl, finishing or timing out per scenario
- [ ] `AC2` Deleting a pod managed by a Deployment produces a replacement with a new name (teaching moment)
- [ ] `AC3` When the namespace is managed by Argo CD with self-heal on, mutating commands succeed but are reverted on the next sync tick (hook provided for E7-06)
- [ ] `AC4` Every mutation is recorded in an audit log available to the challenge engine

---

## E6-08 · Virtual files, apply and edit
<!-- meta: milestone=M2; size=M; labels=area:sim,type:feature; depends=E6-07 -->

**Scope**
- A small virtual filesystem per scenario (`ls`, `cat`, `cd` within it) containing manifests
- `kubectl apply -f <file|dir>`, `kubectl diff -f`, `kubectl edit <resource>` opening an accessible inline YAML editor (CodeMirror 6 with a11y settings, or a plain textarea with line numbers)
- Validation errors mirror real kubectl messages for common mistakes (bad indentation, unknown field, wrong apiVersion)

**Acceptance criteria**
- [ ] `AC1` `edit` is fully keyboard operable, and Save/Cancel are reachable without a mouse
- [ ] `AC2` Malformed YAML returns an error with a line number and does not change state
- [ ] `AC3` `diff` output uses unified diff format

---

## E6-09 · Accessible terminal component
<!-- meta: milestone=M1; size=M; labels=area:sim,type:feature; depends=E1-03 -->

**Scope**
- Styled like a terminal (monospace, prompt showing context and namespace), built from semantic HTML: an output region `role="log"` with `aria-live="polite"` + a labeled `<input>`
- History (↑/↓), Tab completion (commands, resource types, resource names from sim state), Ctrl+L clear, Ctrl+C cancel watch/follow
- Copy output button; per-command output grouping (each command + output is a group with a heading for screen readers)
- Long outputs: screen readers announce a summary ("12 lines of output; press Alt+O to read") rather than flooding the live region
- Mobile: on-screen helper row for Tab, ↑, ↓, Ctrl+C

**Acceptance criteria**
- [ ] `AC1` `manual` NVDA + Firefox and VoiceOver + Safari manual test notes in the PR: the command echo and a concise output summary are announced
- [ ] `AC2` Tab completion lists candidates when ambiguous (like bash) and announces the count
- [ ] `AC3` Terminal state (history, scrollback) is restored on reload via progress snapshot
- [ ] `AC4` Respects text-size settings; no horizontal page scroll (the terminal scrolls within itself)

---

## E6-10 · Challenge engine: objectives, predicates and hints
<!-- meta: milestone=M1; size=M; labels=area:sim,type:feature; depends=E6-01,E6-04,E3-01 -->

**Scope**
- Challenge YAML: `objectives[]`, each with a predicate over sim state, command history/audit log, or a learner answer (e.g., "Which pod is failing?" free-text matched against resource names)
- Predicate library: `ranCommand(pattern)`, `resourceState(selector, path, value)`, `answered(id, matcher)`, `noForbidden(pattern)` (e.g., penalize `delete namespace`)
- **Hint ladder:** nudge → pointer → exact command, unlocked progressively; hints used are recorded
- Live objective checklist next to the terminal; success celebration (reduced-motion aware)

**Acceptance criteria**
- [ ] `AC1` Objectives are evaluated after each command in < 5 ms for typical states
- [ ] `AC2` Each predicate type has unit tests
- [ ] `AC3` Hint usage is visible in progress, and hints never block completion
- [ ] `AC4` An "expert path" script per challenge (list of commands) is run in CI to prove each challenge is solvable

---

## E6-11 · Golden fixtures from a real kind cluster
<!-- meta: milestone=M2; size=M; labels=area:sim,type:test; depends=E6-01 -->

**Context:** This anchors realism. It requires Docker + kind, so run it locally or in a CI job with Docker.

**Scope**
- `tools/fixtures/` with Ravenpost-shaped manifests and fault variants (bad image, crash, OOM, missing config key, bad readiness path, oversized requests)
- Script that creates a kind cluster, applies each variant, waits, and captures `get`/`describe`/`events`/`logs` outputs (all output formats) into `src/sim/__fixtures__/real/`
- Normalizer that masks volatile values (ages, hashes, IPs, timestamps) for structural comparison

**Acceptance criteria**
- [ ] `AC1` `manual` Workflow `capture-fixtures.yml` (manual dispatch) regenerates fixtures and opens a PR
- [ ] `AC2` Structural comparison tests: simulator output for each variant matches the normalized real output (headers, columns, section order, reason strings)
- [ ] `AC3` Pinned kind/Kubernetes version recorded in fixture metadata

---

## E6-12 · Contexts and multi-cluster safety
<!-- meta: milestone=M2; size=S; labels=area:sim,type:feature; depends=E6-04 -->

**Scope**
- `kubectl config get-contexts|current-context|use-context`, `--context` flag
- Scenarios can define multiple clusters (`dev`, `stage`, `prod`); prompt shows the current context, with `prod` styled as a warning
- Teaching hook: predicates can detect "mutation in wrong context"

**Acceptance criteria**
- [ ] `AC1` Prompt and context indicator are announced to screen readers when the context changes
- [ ] `AC2` Output of `get-contexts` matches kubectl format (with `*` current marker)

---

## E6-13 · Sim inspector (dev tool)
<!-- meta: milestone=M2; size=S; labels=area:sim,type:chore; depends=E6-02 -->

**Scope:** Dev-only panel (`?inspector=1`, excluded from production bundle) showing current sim state tree, timeline with a scrubber, audit log, objective evaluation results, and a "copy snapshot" button.

**Acceptance criteria**
- [ ] `AC1` Not present in production bundle (bundle test)
- [ ] `AC2` Scrubbing the timeline re-derives state deterministically
