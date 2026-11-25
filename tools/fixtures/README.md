# Real-cluster fixtures (E6-11)

`capture.mjs` creates a kind cluster at a pinned Kubernetes version (`kindest/node:v1.34.0`). It runs each
fault variant in `variants.mjs` in its own namespace, waits for them to settle, and saves the kubectl output
listed in `CAPTURES` to `src/sim/__fixtures__/real/<variant>/`, along with `metadata.json` (the versions).
Output is masked as it's saved (`src/sim/__fixtures__/normalize.ts`), so the fixtures hold no IPs, hashes,
UIDs or timestamps.

```sh
node tools/fixtures/capture.mjs          # needs Docker, kind and kubectl; --keep leaves the cluster up
```

You can also run the **capture-fixtures** workflow (Actions → capture-fixtures → Run workflow), which opens a
pull request when the output changes.

`src/sim/__fixtures__/real-structure.test.ts` compares the simulator with the fixtures. It runs the same
variant (`src/sim/__fixtures__/variants.ts`) and checks:

- table columns,
- the pod's READY and STATUS,
- `describe` section order,
- container state reasons,
- event reasons.

Pulling events depend on the image cache, so they're ignored. When a fixture changes and the test fails, fix
the simulator, not the fixture.

GitHub doesn't run other workflows for pull requests opened with a workflow's own token, so the pull
request the workflow opens has no CI checks at first. Close and reopen it (or push to its branch) to run them.
