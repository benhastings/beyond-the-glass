# ADR-004: Simulator architecture

- **Status:** Accepted
- **Date:** 2026-11-23

## Context
Learners practice on a simulated cluster, GitOps flow and observability stack. Trust depends on
consistency: a pod restart must show up in `kubectl get events`, the restart panel, the logs and the traces.
Challenges, golden tests and the capstone's expert path must be reproducible. Many agents will add commands,
faults and panels in parallel.

## Decision
- **One timeline, many views:** each scenario defines one timeline of deploys, config changes, faults and load.
  Cluster state, events, Argo CD status, metrics, logs and traces are all derived from it, never authored
  separately.
- **Deterministic:** a seeded RNG and a simulated clock (`SimClock`). `Math.random()` and `Date.now()` are
  banned inside the simulator and telemetry.
- **Framework-free core:** `src/sim/**` is plain TypeScript with no React, DOM or browser APIs (ESLint enforces
  it); the UI is a thin layer over it.
- **Registries:** commands, check types, panels, lesson components and scenario fragments each register in
  their own file, so adding one is one new file plus one registry line.
- **Realism anchored to reality:** `kubectl` and `argocd` output is compared against fixtures captured from a
  real kind cluster (E6-11), and every supported command is listed in `docs/sim/support-matrix.md`.
- **Fail kindly:** an unsupported but real command explains what it would do and suggests a supported one.

## Consequences
- Cross-view consistency comes from construction rather than from discipline, and contract tests can check it.
- Golden-file tests are stable, and a scenario replays identically for every learner.
- Every new fault must add its evidence to every signal it touches. That costs more per fault, which is intended.
- The core runs in Node, so it can be tested fast and to ≥ 90% line coverage.

## Alternatives considered
- **Scripted, per-view canned output:** quick to start, but the views drift apart and the sim feels fake.
- **A real cluster in the browser (WebAssembly kind, or a remote lab):** realistic, but heavy, needs a network
  or a backend, and isn't deterministic. Kept as a stretch idea (ROADMAP §11).
- **Wall-clock time and `Math.random()`:** simpler, but not reproducible, so it can't be golden-tested.
