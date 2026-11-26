# The Long Night: acts, evidence and expert paths

<!-- Generated from src/scenarios/the-long-night.yaml by `npm run capstone-doc`. Edit the scenario, not this file. -->

The capstone (E10-02) runs on the Ravenpost reference system ([`ravenpost.md`](ravenpost.md)). Each act
starts when the one before it is over; its faults are timed from that moment. For each act: what the
learner is told, what every signal shows, the root cause, and a path that ends it.

## 21:02 · The pager

> Your pager goes off: RavenpostHighErrorRate. Senders at the gate are getting errors. A release of ravenpost-api was merged a few minutes ago. Your terminal is still pointed at staging.

| Signal | Evidence |
|---|---|
| kubectl | ravenpost-api pods in ErrImagePull, then ImagePullBackOff; none of the old pods left (the release switched to Recreate) |
| events | Failed to pull image "registry.example/ravenpost/api:v1.15.0": not found; Back-off pulling image |
| logs | No new lines from ravenpost-api (nothing is running); the gate logs 503s from its calls |
| metrics | kube_deployment_status_replicas_available for ravenpost-api drops to 0; the gate's 5xx ratio goes to nearly 100% |
| traces | Gate traces end in errors at ravenpost-api, "no endpoints available" |
| argo | ravenpost synced to the release at about 20:58; health Progressing, then Degraded past the progress deadline |

**Root cause:** The release asked for registry.example/ravenpost/api:v1.15.0; CI publishes 1.15.0 (no v). With the Recreate strategy, the old pods were removed before the new ones could start.

**Over when:**

- ravenpost-api asks for an image the registry has
- No ravenpost-api pod is failing to pull its image

**Expert path:**

1. `kubectl config current-context`
2. `kubectl config use-context prod`
3. `kubectl get pods -n ravenpost`
4. `kubectl describe pod ravenpost-api -n ravenpost`
5. `argocd app history ravenpost`
6. merge request to `ravenpost-deploy/prod/deployment-ravenpost-api.yaml`: Use the image tag CI publishes
7. wait 4m

## 21:19 · Still bleeding

> The image pulls now. But the errors haven't stopped: ravenpost-api starts, and stops, and starts again.

| Signal | Evidence |
|---|---|
| kubectl | ravenpost-api pods in CrashLoopBackOff, RESTARTS climbing; describe shows Last State Terminated, Error, exit code 1 |
| events | Back-off restarting failed container api |
| logs | kubectl logs --previous: "missing required config key LEDGER_BATCH_SIZE (ConfigMap ravenpost-api-config)" |
| metrics | kube_pod_container_status_restarts_total rises for every api pod; replicas available stays 0; the gate's 5xx ratio stays high |
| traces | Still "no endpoints available" at ravenpost-api |
| argo | ravenpost Synced to the fixed tag, health Degraded |

**Root cause:** Version 1.15.0 needs LEDGER_BATCH_SIZE in ravenpost-api-config, and the release didn't add it. (A learner who reverted the release in the first act never meets this.)

**Over when:**

- All three ravenpost-api replicas are available

**Expert path:**

1. `kubectl get pods -n ravenpost`
2. `kubectl logs deploy/ravenpost-api -n ravenpost --previous`
3. merge request to `ravenpost-deploy/prod/configmap-ravenpost-api-config.yaml`: Add LEDGER_BATCH_SIZE, which 1.15.0 needs
4. wait 7m

## 21:41 · The slow creep

> Errors are back to normal. Then the latency panel starts to climb, and a ticket comes in about the scribe. Somewhere, a disk is filling up too.

| Signal | Evidence |
|---|---|
| kubectl | A new scribe pod in CrashLoopBackOff (Last State OOMKilled, exit 137) while the old two keep running; kubectl top shows ledger busy |
| events | Back-off restarting the scribe container; a NodeHasDiskPressure warning on prod-worker-3, a node none of this runs on |
| logs | Ledger request lines take far longer; the OOMKilled scribe's last lines end abruptly |
| metrics | p99 for ledger, ravenpost-api and gate climbs from ~100 ms to over a second; container_memory_working_set_bytes for the new scribe pod hits its 128 MiB limit |
| traces | { duration > 500ms } finds slow traces; the ledger span takes most of the time |
| argo | ravenpost Synced to both commits; health Progressing (the scribe rollout can't finish) |

**Root cause:** Two changes went out minutes apart. Turning on batch lookups made the ledger run one query per message; trimming the scribe's memory limit below what it uses gets each new scribe pod OOMKilled.

**Red herring:** Disk pressure on prod-worker-3, which runs none of the affected pods.

**Over when:**

- Batch lookups are off again
- Both scribe replicas run the current template

**Expert path:**

1. `kubectl get pods -n ravenpost`
2. `kubectl describe pod scribe -n ravenpost`
3. `kubectl get events -n ravenpost --sort-by=.lastTimestamp`
4. `argocd app history ravenpost`
5. merge request to `ravenpost-deploy/prod/configmap-ravenpost-api-config.yaml`: Turn batch lookups off again
6. merge request to `ravenpost-deploy/prod/deployment-scribe.yaml`: Give the scribe its memory back
7. wait 6m

## 22:20 · Someone helped

> Things are quiet. A colleague mentions they tidied up the gate's probe earlier. Then the gate starts answering every request with a 503.

| Signal | Evidence |
|---|---|
| kubectl | gate pods Running but 0/1 Ready; kubectl get endpoints gate shows no addresses |
| events | Readiness probe failed: HTTP probe failed with statuscode: 404 |
| logs | The gate's own lines are normal; nothing reaches it |
| metrics | kube_deployment_status_replicas_available for gate is 0; the gate's 503s are nearly all of its requests |
| traces | Traces end at the gate with 503, "no endpoints available for service gate" |
| argo | kubectl get events -n argocd: an automated sync put back the colleague's kubectl edit; then a sync to their merge request |

**Root cause:** The colleague's kubectl edit was undone by self-heal, so they changed Git instead, to the wrong path (/readyz), and with Recreate there was no old pod left to keep serving.

**Over when:**

- Both gate replicas are available
- The gate's readiness probe checks /ready

**Expert path:**

1. `kubectl get endpoints gate -n ravenpost`
2. `kubectl describe pod gate -n ravenpost`
3. `kubectl get events -n argocd`
4. `argocd app history ravenpost`
5. merge request to `ravenpost-deploy/prod/deployment-gate.yaml`: Point the gate probe back at /ready
6. wait 5m
