# GitOps simulation (E7)

`src/sim/gitops/` is framework-free, and everything in it lives in the simulation's state, so snapshots
carry it.

- **Git** (`git.ts`): repositories of text files. It supports commits (deterministic 40-character SHAs),
  branches, `log` (first parents), `revert` and merge requests (`openMergeRequest`, `merge`, which makes a
  merge commit).
- **Registry** (`registry.ts`): image tags with digests, and the commit each was built from (`pushImage`,
  `hasImage`).
- **Argo CD** (`argo.ts`): Applications with a source (repo, path, target revision), a destination
  (cluster, namespace) and a sync policy (automated, prune, self-heal).
  - `refresh` compares Git with the live cluster through the same validation as `kubectl apply`. It sets
    the sync status per resource and for the app (Synced, OutOfSync, Unknown) and health (Argo's
    Deployment rules: Suspended, Progressing, Degraded, Healthy, Missing), with any conditions.
  - `sync` applies the manifests (tracking them with the `app.kubernetes.io/instance` label), prunes if
    asked, and records the operation and history.
  - The controller reconciles every `reconcileInterval` of sim time (3 minutes by default). Automated
    apps sync each new revision once; with self-heal they also undo drift.

- **Pipelines** (`pipeline.ts`, E7-02): GitLab-style runs, `build → test → scan → package →
  update-manifests`, with jobs `compile`, `unit-tests`, `lint`, `image-scan`, `push-image` and
  `update-manifests`.
  - Jobs run on the sim clock. Their durations are deterministic, hashed from the commit and job name.
  - Each job has a sectioned runner log (prepare, sources, script, cleanup, result).
  - A green run pushes `image:<8-character SHA>` to the registry, then rewrites the `image:` line in the
    deploy repo file, committing as `ravenpost-ci`. Argo then picks the change up.
  - Outcomes come only from the scenario. The `pipeline` timeline event commits to an app repo and runs
    its pipeline. `ciFailure` makes the next run for a project fail. A run can fail in one of five ways:
    - `test`: a failing unit test.
    - `lint`: a lint error.
    - `scan`: a critical advisory in the image.
    - `push`: the registry refuses the push.
    - `bad-tag`: the pipeline is green but writes a 7-character tag nobody pushed, so pods hit
      `ErrImagePull`.
  - The UI is `src/app/gitops/PipelineView.tsx`: a graph with a list (table) alternative, statuses as an
    icon and a word, and collapsible log sections.

Scenarios declare it under `gitops:`:

```yaml
gitops:
  reconcileInterval: +3m
  repos:
    ravenpost-deploy:
      files:
        shop/web.yaml: |
          apiVersion: apps/v1
          kind: Deployment
          ...
  ci:
    shop-web: # an app repo
      image: registry.example/web
      deploy: { repo: ravenpost-deploy, file: shop/web.yaml }
  applications:
    - name: shop
      source: { repo: ravenpost-deploy, path: shop, targetRevision: main }
      destination: { cluster: dev, namespace: shop }
      syncPolicy: { automated: { prune: true, selfHeal: true } }
```

```yaml
timeline:
  - { at: +1m, type: pipeline, project: shop-web, message: Add parcel tracking }
  - { at: +20m, type: pipeline, project: shop-web, failure: test }
  - { at: +40m, type: ciFailure, project: shop-web, failure: bad-tag } # the next run, however it starts
```

## The Argo CD console (E7-05)

`src/app/gitops/argo/ArgoConsole.tsx` is a console that evokes Argo CD's layout, with no Argo CD logo,
colours or marks. It reads `src/sim/gitops/tree.ts`:

- **Applications:** tiles or a list (table), with health and sync shown as an icon and a word.
- **An application:**
  - Refresh, Sync… (a dialog with prune and dry run; a dry run lists what would change and changes
    nothing), and History and rollback. Rollback is off while auto-sync is on, with the reason given.
  - **Tree:** the resource tree (Application → Deployment → ReplicaSet → Pods; Service → Endpoints) as a
    WAI-ARIA tree with one tab stop and arrow keys.
  - **Table:** the same nodes, with what each is part of.
  - Each node has health by Argo's rules for Deployments, ReplicaSets and Pods. The app's health is the
    worst of its resources, live.
- **A node:**
  - Summary, live manifest, desired manifest, diff and events.
  - For pods, the logs: the same lines `kubectl logs` prints, from the same function.

`argocd app diff` and the console's Diff tab share `resourceDiffs`.

## Merge requests (E7-03)

`src/sim/gitops/mr.ts` runs the flow; `src/app/gitops/MergeRequestFlow.tsx` is its UI.

- `proposeChange` commits to a new branch (`you/<file>`) and opens a merge request. `pushToMergeRequest`
  adds a fix to the same branch.
- If the repo has a `ci:` entry with no `image` (a deploy repo), each push runs a validation pipeline,
  `lint → validate → policy`, on the files the branch changed:
  - **`yaml-lint`** reports the parser's error.
  - **`schema`** checks for an `apiVersion`, a `kind`, a `metadata.name`, and an image on every container.
  - **`policy-check`** applies the repo's `policies`: `no-latest-tag` and `memory-limits`. Each message
    says what to change and why.
- A scenario can also make the next run fail on purpose: a `ciFailure` event with `failure: lint` (a
  missing `---`) or `failure: policy` (a change freeze).
- `mergeBlocker` explains why a merge request can't merge yet ("Pipelines must succeed").
  `mergeMergeRequest` merges it. Argo CD picks the merge up on its next reconcile.
- The UI has a guided editor, a unified diff, the pipeline view, and "Wait for the pipeline" and "Watch
  Argo CD" buttons, which advance simulated time.
  - The diff has `+`/`-` markers and line numbers. Each changed line is read out as "added line 19:
    memory: 512Mi", and a polite summary counts the changes.
  - Every step works from the keyboard.

```yaml
gitops:
  ci:
    ravenpost-deploy:
      policies: [no-latest-tag, memory-limits]
```

## Argo CD events

Argo CD records its own events on the Application, in the `argocd` namespace. You can see them in the
console (the Application node's Events tab) and with `kubectl get events -n argocd`:

- `ResourceUpdated`: "Updated sync status: Synced -> OutOfSync", and back.
- `OperationStarted`: "Initiated automated sync to '<sha>'", or a manual sync or rollback.
- `OperationCompleted`: "Sync operation to <sha> succeeded" or "… failed: <message>".

So when self-heal undoes a `kubectl scale`, the learner can see it happen. Automated sync doesn't retry a
revision it failed to sync, as in Argo CD.

## Scenario fragments (E7-06)

`src/sim/gitops/fragments/` holds reusable GitOps situations. Each needs a world with a deploy repo and an
Argo CD application. `composeFragments(input, [{ fragment, params }])` adds them to a scenario input:

| Fragment | Sync policy | What happens | Solved when |
|---|---|---|---|
| `drift-self-heal` | automated, self-heal | A hand-made `kubectl scale` is put back on the next reconcile | The replicas are changed through a merge request |
| `manual-sync` | manual | A colleague's merged release waits in Git (`gitCommit`) | Synced, running the new image |
| `sync-failed` | automated, no self-heal | A selector change can't apply: the sync fails with "field is immutable" | The learner read the operation and merged a revert; Synced and Healthy |
| `bad-release` | automated, self-heal | A release with a tag that doesn't exist: ErrImagePull, then Degraded | Healthy on the old image, through either expert path (below) |

For `bad-release`, the two expert paths trade off differently:

- **`git revert` through a merge request:** keeps Git true, but takes a pipeline.
- **`argocd app set --sync-policy none` and then `argocd app rollback`:** faster, but leaves Git asking for
  the bad release until it's reverted.

Each fragment's params name the target (`app`, `repo`, `file`, `namespace`, `deployment`, `image`, `tag`)
and when the trouble starts (`at`).

Fragments compose. Two fragments that need different sync policies on the same app are refused, with an
error naming both. Expert paths are data (`run`, `mr`, `revertMr`, `wait`) that `playExpertPath` replays,
so the capstone (E10) can reuse them.

