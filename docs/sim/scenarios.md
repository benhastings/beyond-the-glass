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
| `images` | no | How each image behaves when it runs ([below](#image-behaviour)); healthy if absent |

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
| `setResources` | `namespace`, `deployment`, `container`, `requests`, `limits` | Changes requests/limits: too-large requests leave pods Pending; a memory limit below the app's use gets them OOMKilled |
| `setReadinessPath` | `namespace`, `deployment`, `container`, `path` | Points the readiness probe at another path: a path the app doesn't serve gets 404 and the pod is never Ready |
| `setServiceSelector` | `namespace`, `service`, `selector` | Replaces a Service's selector: one that matches no pods leaves it with no endpoints |

`setImage` also takes an optional `behaviour` for the new image: the usual way to break something with a
deploy (a crash on start, a tag that doesn't exist).

Controllers (E6-02, E6-03) turn these changes into rollouts, restarts and events. To add a type: one file in
`src/sim/core/timeline/` using `defineTimelineEvent`, plus one line in `src/sim/core/timeline/index.ts`.

## Image behaviour

`images` maps an image reference to how it behaves (all fields optional; see `behaviourSchema` in
`src/sim/core/behaviour.ts`):

| Field | Effect |
|---|---|
| `exitAfterMs`, `exitCode`, `reason` | The process exits this long after starting: CrashLoopBackOff |
| `pull: notFound` / `unauthorized` | The image can't be pulled: ErrImagePull, then ImagePullBackOff |
| `memoryMi` | Steady memory use: above the container's limit it's OOMKilled (exit 137) |
| `cpuMillis` | Steady CPU use (`kubectl top`) |
| `healthPaths` | Paths the app serves; probes on other paths get 404 |
| `readiness`, `liveness` | `fail` makes that probe fail (503 / 500) |
| `log` | Log lines it writes on start (and before a crash) |

```yaml
images:
  registry.example/ravenpost/api:1.14.0: { healthPaths: [/ready, /healthz], memoryMi: 180 }
timeline:
  - at: +4m
    type: setImage
    namespace: ravenpost
    deployment: ravenpost-api
    container: api
    image: registry.example/ravenpost/api:1.15.0
    behaviour: { exitAfterMs: 1500, exitCode: 1, log: ['FATAL: missing required config key LEDGER_POOL_SIZE'] }
```

Deleting a ConfigMap key (`deleteConfigKey`) doesn't touch running pods: pods created afterwards fail with
`CreateContainerConfigError`, as on a real cluster. See [`lifecycle.md`](lifecycle.md) for the evidence each
fault leaves.

## Determinism and snapshots

`Simulator.load(scenario)` always builds the same state for the same seed. `sim.snapshot()` is plain JSON (the
clock, the RNG state, every object and the pending wakeups); `Simulator.restore(scenario, snapshot)` continues
exactly where it stopped. Inside `src/sim`, ESLint rejects `Math.random()`, `Date.now()` and `new Date()`.

## Files (E6-08)

`files:` maps paths relative to the learner's home folder (`/home/operator`) to their contents. They are
read-only; `ls`, `cat`, `cd` browse them and `kubectl apply -f` / `kubectl diff -f` read them. Use them for
the manifests a lesson asks the learner to inspect, fix (in the cluster with `kubectl edit`) or apply.

```yaml
files:
  manifests/notifier.yaml: |
    apiVersion: apps/v1
    kind: Deployment
    ...
```
