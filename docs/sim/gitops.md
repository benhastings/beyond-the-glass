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
  applications:
    - name: shop
      source: { repo: ravenpost-deploy, path: shop, targetRevision: main }
      destination: { cluster: dev, namespace: shop }
      syncPolicy: { automated: { prune: true, selfHeal: true } }
```
