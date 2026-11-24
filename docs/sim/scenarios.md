# Scenario files

A scenario is one YAML file in `src/scenarios/`. It describes one or more clusters as they are when the learner
arrives, and a timeline of what happens afterwards. Everything the learner sees (cluster state, events and, later,
Argo CD status, metrics, logs and traces) is derived from it ([ADR-004](../adr/ADR-004-simulator-architecture.md)).

The build validates every scenario with the Zod schema in `src/sim/core/scenario.ts`, then loads it into the
simulator once. Any problem fails `vite build` (and the dev server) with `file:line:column field: message`.

To add a scenario: create `src/scenarios/<id>.yaml`, then add one line to the map in `src/scenarios/index.ts`.
`ravenpost.yaml` is the reference example.

## Top level

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Lowercase slug; snapshots and challenges refer to it |
| `title`, `description` | title | Shown to authors and in the sim inspector |
| `seed` | no (1998) | Seeds the RNG: pod-name suffixes, UIDs and Service IPs |
| `startTime` | no (`2026-03-14T02:10:00Z`) | Wall-clock moment the scenario starts |
| `currentContext` | yes | One of `contexts[].name` |
| `contexts` | yes | `name`, `cluster`, `user`, optional default `namespace` (like a kubeconfig) |
| `clusters` | yes | See below |
| `timeline` | no | See below |
| `objectives` | no | IDs of challenges that use this scenario |

## Clusters

| Field | Default | Meaning |
|---|---|---|
| `name` | | Slug; contexts point at it |
| `server` | | API server URL. Use a `.example` host or a loopback address |
| `kubernetesVersion` | `v1.34.0` | Reported by nodes and system pod images |
| `system` | `kind` | `kind` adds what a fresh kind cluster runs (CoreDNS, etcd, the control-plane pods, kube-proxy, kindnet, local-path-provisioner, the `kubernetes` and `kube-dns` Services); `none` adds nothing |
| `age` | `-14d` | When the cluster (and, by default, every object) was created |
| `nodes` | | `name`, `role` (`control-plane` or `worker`), `cpu`, `memory`, `pods`. Workloads are spread across workers in order; the control plane is tainted |
| `resources` | `[]` | Manifests: `Namespace`, `ConfigMap`, `Secret`, `Deployment`, `Service` |
| `podOverrides` | `[]` | The starting state of individual pods (below) |

Manifests use the real Kubernetes field names and are checked strictly: a misspelt field is an error, as with
`kubectl apply`. Each Deployment gets a ReplicaSet named with a real-style `pod-template-hash` and running,
Ready pods. Namespaces that resources mention are created automatically.

Sim-only extensions:
- `metadata.creationTimestamp` may be relative, such as `-9d`, to give objects a believable age.
- **Secret values are never kept.** `data` (base64) and `stringData` are reduced to each value's length when the
  file is parsed, so no value reaches the bundle, a snapshot or any view. Use obviously fake values anyway.

### Pod overrides

For anything that happened before the learner arrived. The replica is chosen by creation order (`replica: 0` is
the first pod), and times may be relative.

```yaml
podOverrides:
  - namespace: ravenpost
    deployment: ravenpost-notifier
    replica: 0
    createdAt: -25m
    containers:
      notifier:
        restartCount: 9
        state: { waiting: { reason: CrashLoopBackOff } }
        lastState:
          terminated: { exitCode: 1, reason: Error, startedAt: -1m52s, finishedAt: -1m50s }
```

Readiness, the pod's `Ready`/`ContainersReady` conditions, its phase and the standard `CrashLoopBackOff`
message are filled in to match.

## Timeline

Each entry has `at` (an offset such as `+4m` or `1h30m`), `type`, an optional `cluster` (default: the first) and
the type's own fields. References are checked against the cluster's manifests.

| `type` | Fields | Effect |
|---|---|---|
| `setImage` | `namespace`, `deployment`, `container`, `image` | Changes the image in the pod template |
| `setMemoryLimit` | `namespace`, `deployment`, `container`, `limit` | Changes the container's memory limit |
| `deleteConfigKey` | `namespace`, `configMap`, `key` | Removes a key from a ConfigMap |
| `injectLatency` | `namespace`, `service`, `ms` | Adds latency to a Service's requests (telemetry, E8-01) |
| `load` | `namespace`, `service`, `rps` | Sets a Service's request rate (telemetry, E8-01) |

Controllers (E6-02, E6-03) turn these changes into rollouts, restarts and events. To add a type: one file in
`src/sim/core/timeline/` using `defineTimelineEvent`, plus one line in `src/sim/core/timeline/index.ts`.

## Determinism and snapshots

`Simulator.load(scenario)` always builds the same state for the same seed. `sim.snapshot()` is plain JSON (the
clock, the RNG state, every object and the pending wakeups); `Simulator.restore(scenario, snapshot)` continues
exactly where it stopped. Inside `src/sim`, ESLint rejects `Math.random()`, `Date.now()` and `new Date()`.
