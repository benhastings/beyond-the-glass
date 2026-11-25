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
