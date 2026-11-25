# Workloads and pod lifecycle

How the simulated cluster moves (E6-02). The controllers live in `src/sim/controllers/` and run in this
order after every timeline event, wakeup and command: **deployment → replicaset → scheduler → kubelet**.
`loadSimulation(scenario)` starts a simulation with all of them. Everything happens in simulated time,
through scheduled wakeups, so the same scenario and seed always produce the same history.

## Rolling updates

The deployment controller uses kube-controller-manager's arithmetic. With the default strategy
(`maxSurge: 25%` rounded **up**, `maxUnavailable: 25%` rounded **down**), each sync:

1. scales the new ReplicaSet up, keeping the total at most `replicas + maxSurge`;
2. scales old ReplicaSets down (unhealthy pods first, then the oldest sets), keeping at least
   `replicas − maxUnavailable` pods available.

For **3 replicas, v1 → v2** (surge 1, unavailable 0) the documented sequence, which the tests check, is:

| Step | Event (`ScalingReplicaSet`) |
|---|---|
| 1 | Scaled up replica set web-*v2* from 0 to 1 |
| 2 | Scaled down replica set web-*v1* from 3 to 2 (once the new pod is available) |
| 3 | Scaled up replica set web-*v2* from 1 to 2 |
| 4 | Scaled down replica set web-*v1* from 2 to 1 |
| 5 | Scaled up replica set web-*v2* from 2 to 3 |
| 6 | Scaled down replica set web-*v1* from 1 to 0 |

For 10 replicas (surge 3, unavailable 2) the first sync scales v2 up to 3 and v1 down to 8 together.
`Recreate` scales every old ReplicaSet to 0, waits for the pods to stop, then scales the new one up.
Each template gets its own ReplicaSet (named by `pod-template-hash`) and a revision number; rolling back
(`rollbackDeployment`, used by `kubectl rollout undo` in E6-07) revives the old ReplicaSet with the next
revision. Idle ReplicaSets beyond `revisionHistoryLimit` are deleted. While a rollout is under way the
Progressing condition reads `ReplicaSetUpdated` ("ReplicaSet … is progressing."), then
`NewReplicaSetAvailable`.

## Scheduling

A new pod is bound to the node with the most free CPU among those that fit its **requests** (CPU,
memory, pod count). Nodes with a `NoSchedule` taint (the control plane) are skipped. A pod that fits
nowhere stays `Pending`, with `PodScheduled=False`, reason `Unschedulable` and a `FailedScheduling` event
in kube-scheduler's words, for example:

```text
0/3 nodes are available: 2 Insufficient memory, 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane: }. preemption: 0/3 nodes are available: 1 Preemption is not helpful for scheduling, 2 No preemption victims found for incoming pod.
```

It's retried whenever anything changes.

## Pod lifecycle (the kubelet)

| Time | State | Events |
|---|---|---|
| bound | `Pending`, container waiting `ContainerCreating` | `Scheduled` |
| +0.5 s | | `Pulling image "…"` (or `Container image "…" already present on machine`) |
| +1.2–3.6 s (pull) | | `Successfully pulled image "…" in 1.234s (…). Image size: N bytes.` |
| +0.3 s | `Running`, container running | `Created container: web`, `Started container web` |
| + `initialDelaySeconds` + 1 s | Ready (with a readiness probe; without one, Ready on start) | |

How a container behaves once started comes from `setImageBehaviour` / `setPodBehaviour` (healthy by
default); fault injectors (E6-03) use the same hook:

- **Exits** (`exitAfterMs`, `exitCode`, `reason`): `lastState.terminated` records it, the container waits
  in `CrashLoopBackOff`, a `BackOff` event is recorded, and it restarts after the backoff.
- **Readiness fails**: the pod stays not Ready; `Unhealthy` "Readiness probe failed: HTTP probe failed with
  statuscode: 503" every period.
- **Liveness fails**: after `failureThreshold × periodSeconds`, `Unhealthy` "Liveness probe failed: …",
  `Killing` "Container web failed liveness probe, will be restarted", exit 137, then a restart.
- **Deleted**: `Killing` "Stopping container …", and the pod is gone 2 s later. Its ReplicaSet has
  already created a replacement with a new name.

A pod that was already crash-looping when the scenario began keeps failing the way its last termination
says, at the 5-minute backoff cap, until it's replaced.

### Restart backoff

Before restart *n + 1* (after *n* restarts) the kubelet waits **min(10 s × 2ⁿ, 5 min)**:

| Restart | 1 | 2 | 3 | 4 | 5 | 6 | 7+ |
|---|---|---|---|---|---|---|---|
| Wait | 10 s | 20 s | 40 s | 1m20s | 2m40s | 5m0s | 5m0s |

The waiting message reads `back-off 40s restarting failed container=web pod=<pod>_<ns>(<uid>)`. A container
that ran for 10 minutes before exiting starts again from 10 s. `RESTARTS` counts every restart.

## Failure modes (E6-03)

| Fault | `get pods` STATUS | Container state | Events |
|---|---|---|---|
| Tag that doesn't exist | `ErrImagePull`, then `ImagePullBackOff` (pod `Pending`) | waiting, with containerd's `rpc error: code = NotFound …` | `Pulling`, `Failed` "Failed to pull image …", `Failed` "Error: ErrImagePull", `BackOff` "Back-off pulling image …", `Failed` "Error: ImagePullBackOff"; retried with the 10s→5m backoff |
| Crash on start | `CrashLoopBackOff` | waiting; Last State terminated with the exit code, reason `Error` | `BackOff` "Back-off restarting failed container …" |
| Memory over the limit | `OOMKilled` briefly, then `CrashLoopBackOff` | Last State terminated `OOMKilled`, exit 137 | `BackOff` |
| Missing ConfigMap/Secret (or key) | `CreateContainerConfigError` | waiting: `couldn't find key MODE in ConfigMap shop/web-config` (or `configmap "x" not found`) | `Failed` "Error: …"; retried every 10 s |
| Readiness probe on a wrong path | `Running`, `0/1` | running, not ready | `Unhealthy` "Readiness probe failed: HTTP probe failed with statuscode: 404"; the pod is in the Service's `notReadyAddresses` |
| Requests larger than any node | `Pending` | none | `FailedScheduling` "0/3 nodes are available: …" |
| Selector that matches nothing | (pods fine) | | The Service has no endpoints |

Repeated events fold into one with a count and a new last timestamp, as the event recorder does. A named
`targetPort` resolves through the pods' container ports.

## Changes, the audit log and GitOps (E6-07)

Every command that changes a cluster (`scale`, `delete`, `set image`, `rollout undo|restart|pause|resume`,
`label`, `annotate`) records an entry with `recordMutation` (`src/sim/core/audit.ts`):

- when it happened (sim time),
- who made it (`learner`, or `argocd` for a self-heal),
- the verb, the object, the command line and verb-specific details.

The challenge engine reads `auditLog(sim)` to check how a task was done, and the log is kept in snapshots.
Read-only commands and commands that fail record nothing.

`manageNamespace(sim, { cluster, namespace, app, selfHeal, intervalMs })` (`src/sim/controllers/gitops.ts`)
is the hook E7-06 builds Argo CD on:

- It treats the namespace's current Deployments, Services, ConfigMaps and Secrets as Git's desired state.
- Every sync tick (default 3 minutes) with `selfHeal` on, objects that have drifted or been deleted are put back, and each is recorded as an `argocd` `sync` entry.
- The learner's changes succeed when made, and the next tick reverts them, as on a real GitOps-managed cluster.

Deleting one of a Deployment's pods shows the other half of the same lesson: its ReplicaSet creates a
replacement with a new name straight away.

`rollout status` relies on the Progressing condition. Its `lastUpdateTime` moves only when the rollout makes
progress. A rollout that makes no progress for `progressDeadlineSeconds` becomes `Progressing=False`,
`ProgressDeadlineExceeded`, which `rollout status` reports as `exceeded its progress deadline`.

## Sim inspector (E6-13)

In a dev build (`npm run dev`), add `?inspector=1` to the URL (before or after the `#`). A panel then shows the
most recently opened terminal's simulation. It has:

- a timeline scrubber, which replays the scenario and the learner's commands to that moment with `replayTo()`,
- the audit log,
- the challenge's objective results,
- the cluster state,
- a **Copy snapshot** button.

The panel is imported only behind `import.meta.env.DEV`, so production builds don't contain it
(`tests/repo/production-bundle.test.ts`).
