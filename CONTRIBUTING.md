# Contributing

Start with [`AGENTS.md`](AGENTS.md): it has the ground rules, the Definition of Done and the guardrails.
[`README.md`](README.md#getting-started) lists the npm scripts.

## Continuous integration

Every pull request and every push to `main` runs these workflows:

| Workflow | Job (the check's name) | What it runs |
|---|---|---|
| `.github/workflows/ci.yml` | `verify` | `npm ci`, typecheck, lint, Prettier, unit tests, build, then a bundle-size table in the job summary and the `dist` artifact |
| `.github/workflows/ac-trace.yml` | `gate` | the acceptance-criteria gate for the issue the PR closes |
| `.github/workflows/plan.yml` | `validate` | plan and tracer validation (only when `docs/plan`, `docs/evidence` or `scripts` change) |

## Branch protection

`main` is protected. To recreate the rule (Settings → Branches, or the API call below):

- Require a pull request before merging
- Require status checks to pass, with the branch up to date. Required checks (named exactly as above):
  - `verify`
  - `gate`
- Do not allow force pushes or deletions

`validate` isn't required because it only runs when the plan or scripts change; a required check that
never starts would block every other PR.

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify", "gate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```
