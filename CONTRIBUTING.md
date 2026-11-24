# Contributing

Start with [`AGENTS.md`](AGENTS.md): it has the ground rules, the Definition of Done and the guardrails.
[`README.md`](README.md#getting-started) lists the npm scripts.

## Continuous integration

Every pull request and every push to `main` runs these workflows:

| Workflow | Job (the check's name) | What it runs |
|---|---|---|
| `.github/workflows/ci.yml` | `verify` | `npm ci`, typecheck, lint, Prettier, unit tests with coverage thresholds, build, then a bundle-size table in the job summary and the `dist` artifact |
| `.github/workflows/ci.yml` | `e2e` | Playwright with axe in Chromium, Firefox and WebKit against `vite preview`; traces and screenshots uploaded on failure |
| `.github/workflows/ci.yml` | `gate` | the acceptance-criteria gate: every criterion of each plan issue the PR `Closes` must be traced by a test that passed in this run, or by evidence ([docs/testing/acceptance-criteria.md](docs/testing/acceptance-criteria.md)) |
| `.github/workflows/plan.yml` | `validate` | plan and tracer validation (only when `docs/plan`, `docs/evidence` or `scripts` change) |

## Branch protection

`main` is protected. To recreate the rule (Settings → Branches, or the API call below):

- Require a pull request before merging
- Require status checks to pass, with the branch up to date. Required checks (named exactly as above):
  - `verify`
  - `e2e`
  - `gate`
- Do not allow force pushes or deletions

`validate` isn't required because it only runs when the plan or scripts change; a required check that
never starts would block every other PR.

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify", "e2e", "gate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```
