# E9 · Curriculum: the regions of the Reach
<!-- epic: milestone=M3; labels=area:curriculum -->

**Goal:** Lessons that take a Watchstander from "what's a container?" to running the triage flow, reading an Argo app tree and finding the slow span. Each lesson connects to what learners already know.

**Content Definition of Done** (applies to every issue in this epic, in addition to each issue's own acceptance criteria)
- [ ] Learning objectives are written as observable actions ("List pods in a namespace and identify one that isn't Ready")
- [ ] Every core concept uses `<Depth>` with an ELI5 layer (≤ grade 8 reading level) and an Operator layer
- [ ] At least one `<Analogy>` per lesson connecting to on-prem/NOC experience, and new Rosetta Stone entries added where relevant
- [ ] ≥ 3 knowledge checks per lesson; ≥ 1 hands-on sim challenge per lesson wherever a tool is involved, each with an expert-path test
- [ ] Every command shown is supported by the simulator and appears in the support matrix
- [ ] Every lesson is 10–20 minutes (estimated at 200 wpm + challenge time), with steps ≤ ~350 words
- [ ] Teaches the habits: **check your context, look before you touch, change through Git, correlate signals**
- [ ] `lint:content` and content-guard pass; generic fictional examples only
- [ ] SME review approval recorded in the PR
- [ ] Module test-out check (3–5 items) included

**Epic success criteria**
- [ ] `SC1` Watchstander persona's full path (Console Room → Signalwood) totals 6–9 hours of estimated learning time
- [ ] `SC2` `manual` Pilot learners score ≥ 80% on module test-outs after completing modules (E11-04)
- [ ] `SC3` Every failure mode used in the capstone is first taught in isolation somewhere in E9

---

## E9-01 · Console Room: "From the NOC to the Cluster"
<!-- meta: milestone=M3; size=M; labels=area:curriculum,type:content; depends=E5-04,E5-05,E5-03,E2-05 -->

**Lessons**
1. *What changed, and what didn't*: pets vs cattle, desired state, automation as the operator's teammate; respect for operational instincts that still apply (change discipline, calm under pressure, knowing what "normal" looks like)
2. *From watching to being told*: wall-of-screens monitoring vs alerting on symptoms and SLOs
3. *Your Field Guide*: how to use the Rosetta Stone and depth layers

**Acceptance criteria**
- [ ] `AC1` `manual` Tone tested with ≥ 2 pilot learners from the target background: "respectful, not condescending" (feedback recorded)
- [ ] `AC2` Rosetta Stone entries referenced from these lessons all exist (build validation)

---

## E9-02 · The Harbor: containers and images
<!-- meta: milestone=M3; size=M; labels=area:curriculum,type:content; depends=E5-04,E5-05,E5-03 -->

**Lessons**
1. *Shipping containers for software*: process isolation, why "works on my machine" went away; container vs VM (connect to VMware/golden images)
2. *Images, layers, tags and registries*: immutability, tags vs digests, why `latest` is a trap
3. *Reading a Dockerfile* (spot-the-bug check) and what `docker run`/`ps`/`logs` would show (conceptual; no Docker sim required)

**Acceptance criteria**
- [ ] `AC1` Includes a spot-the-bug check on a Dockerfile and a matching check on image tag vs digest
- [ ] `AC2` Sets up ImagePullBackOff conceptually (wrong tag/registry), which E9-06 later reinforces hands-on

---

## E9-03 · Helm Keep I: cluster anatomy, pods and namespaces
<!-- meta: milestone=M3; size=M; labels=area:curriculum,type:content; depends=E5-04,E5-05,E6-05,E6-10 -->

**Lessons**
1. *The keep and its stewards*: control plane, API server, scheduler, controllers, etcd, nodes, kubelet (ELI5: a castle that keeps restoring itself to the plan)
2. *Pods*: why a pod and not a container; pod lifecycle; `kubectl get pods`, `describe pod`
3. *Namespaces and labels*: multi-tenant organization; selectors (`-l app=ledger`)

**Acceptance criteria**
- [ ] `AC1` Sim challenges: find all pods for an app via label; identify which node a pod runs on (`-o wide`); count pods per namespace
- [ ] `AC2` Diagram of cluster anatomy rendered via `<Diagram>` with alt text

---

## E9-04 · Helm Keep II: deployments, services, config and resources
<!-- meta: milestone=M3; size=L; labels=area:curriculum,type:content; depends=E9-03,E6-07,E6-08 -->

**Lessons**
1. *Desired state and reconciliation*: Deployment → ReplicaSet → Pods; rolling updates; `rollout status/history`
2. *Services and DNS*: stable addresses for moving targets (connect to VIPs/load balancers); endpoints
3. *ConfigMaps and Secrets*: config outside the image; why secrets are redacted
4. *Probes, requests and limits*: readiness vs liveness; requests for scheduling vs limits for enforcement; what OOMKilled means

**Acceptance criteria**
- [ ] `AC1` Sim challenges: delete a pod and observe replacement; scale a deployment; trace a Service to its endpoints; observe a rolling update
- [ ] `AC2` Probes lesson includes a spot-the-bug readiness probe check (wrong path/port)

---

## E9-05 · The Chartroom I: kubectl essentials and safe habits
<!-- meta: milestone=M3; size=M; labels=area:curriculum,type:content; depends=E6-05,E6-06,E6-12,E6-10 -->

**Lessons**
1. *Know where you are*: contexts, namespaces, the prompt; why `prod` is scary (challenge: a mutation attempted in the wrong context is flagged)
2. *Look before you touch*: get, describe, events, logs, `-o wide/yaml`, `--previous`; read-only first
3. *Finding things fast*: selectors, `-A`, `--sort-by`, piping to grep/head

**Acceptance criteria**
- [ ] `AC1` The walking-skeleton lesson (E5-07) is replaced or absorbed into this module with final content
- [ ] `AC2` Each command introduced appears on the printable kubectl card (E2-07)

---

## E9-06 · The Chartroom II: the triage flow and common failures
<!-- meta: milestone=M3; size=L; labels=area:curriculum,type:content; depends=E9-05,E6-03,E6-07 -->

**Lessons:** One lesson introducing **the triage flow** (context → get → describe → events → logs/--previous → recent changes), then one mini-scenario per failure:
1. CrashLoopBackOff (app error at startup; `--previous` logs)
2. ImagePullBackOff (bad tag)
3. CreateContainerConfigError (missing config key)
4. OOMKilled (limit too low)
5. Pending (insufficient resources)
6. Running but not Ready → Service has no endpoints (bad readiness path)

**Acceptance criteria**
- [ ] `AC1` Each mini-scenario requires the learner to **state the root cause** (answer predicate) before seeing the fix
- [ ] `AC2` Fixes in this module use kubectl (pre-GitOps), with a callout foreshadowing "in our world, the real fix goes through Git" (Mirror Lake)
- [ ] `AC3` An ordering check verifies the triage flow sequence

---

## E9-07 · Mirror Lake I: from commit to image (GitLab CI)
<!-- meta: milestone=M4; size=M; labels=area:curriculum,type:content; depends=E7-02,E7-03 -->

**Lessons**
1. *Git in five minutes for operators*: commits, branches, merge requests as change tickets you can diff
2. *Reading a pipeline*: stages and jobs, artifacts, where an image tag comes from
3. *When a pipeline fails*: reading job logs; failed test vs failed scan vs registry error

**Acceptance criteria**
- [ ] `AC1` Challenge: identify which job failed and why from a pipeline view, and answer which image tag (if any) was produced
- [ ] `AC2` Analogy: MR ≈ change request with automatic peer review and a full audit trail

---

## E9-08 · Mirror Lake II: Argo CD and GitOps discipline
<!-- meta: milestone=M4; size=L; labels=area:curriculum,type:content; depends=E7-04,E7-05,E7-06,E9-07 -->

**Lessons**
1. *The lake and its reflection*: desired vs live state, sync status vs health status
2. *Reading an application*: resource tree, diff, events, history
3. *Drift*: why your `kubectl edit` didn't stick (self-heal) and why that's a feature
4. *Rolling back*: `git revert` vs `argocd app rollback`, and when each fits

**Acceptance criteria**
- [ ] `AC1` Challenges use E7-06 fragments 1–4, each with an expert-path test
- [ ] `AC2` A challenge requires fixing a misconfiguration **via MR**; a kubectl-only fix is detected and explained (not penalized harshly; the learner gets coached to redo it via Git)

---

## E9-09 · Signalwood I: metrics, Prometheus and Grafana
<!-- meta: milestone=M4; size=L; labels=area:curriculum,type:content; depends=E8-02,E8-03 -->

**Lessons**
1. *What a metric is*: counters, gauges, histograms; labels; scrape model (connect to SNMP polling)
2. *RED and USE*: what to look at first for a service vs a resource
3. *Reading dashboards*: time ranges, annotations, spotting "what changed"
4. *PromQL starter kit*: `rate`, `sum by`, `histogram_quantile` with the starter library

**Acceptance criteria**
- [ ] `AC1` Challenges: find when error rate spiked and correlate it to a deploy annotation; write a query for p99 latency by service
- [ ] `AC2` Every PromQL example runs in the E8-03 explorer (test enumerates examples)

---

## E9-10 · Signalwood II: OpenTelemetry traces and logs
<!-- meta: milestone=M4; size=L; labels=area:curriculum,type:content; depends=E8-04,E8-05,E8-06 -->

**Lessons**
1. *Following one request*: traces and spans (ELI5: a parcel's tracking history across depots), connect to traceroute
2. *Context propagation and the Collector*: with the E8-06 explainer
3. *Logs that know their trace*: structured logs, `trace_id`, correlation
4. *Finding the slow span*: from latency panel → exemplar → trace → span → logs

**Acceptance criteria**
- [ ] `AC1` Challenge: given a latency regression, identify the service and operation responsible and the log line that explains it
- [ ] `AC2` Challenge: diagnose broken traces caused by missing propagation (from E8-06 toggles)

---

## E9-11 · Signalwood III: alerts, SLOs and the first five minutes
<!-- meta: milestone=M4; size=M; labels=area:curriculum,type:content; depends=E8-07,E9-10 -->

**Lessons**
1. *Alerts that mean something*: symptoms vs causes, `for` durations, runbooks
2. *SLOs and error budgets*: why "99.9%" changes conversations
3. *The first five minutes*: acknowledge → assess impact → check recent changes (Argo history) → dashboards → traces → logs → kubectl; writing a crisp incident note

**Acceptance criteria**
- [ ] `AC1` Ordering check for the first-five-minutes sequence; a structured incident-note exercise graded by a rubric (impact, timeline, evidence, hypothesis, next step)
- [ ] `AC2` Printable "first five minutes" card content matches this lesson (E2-07)
