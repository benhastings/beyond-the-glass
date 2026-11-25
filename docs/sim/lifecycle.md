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
