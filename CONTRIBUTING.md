# Contributing

Start with [`AGENTS.md`](AGENTS.md): it has the ground rules, the Definition of Done and the guardrails.
[`README.md`](README.md#getting-started) lists the npm scripts.

## Continuous integration

Every pull request and every push to `main` runs these workflows:

| Workflow | Job (the check's name) | What it runs |
|---|---|---|
| `.github/workflows/ci.yml` | `verify` | `npm ci`, typecheck, lint, Prettier, unit tests, build, then a bundle-size table in the job summary and the `dist` artifact |
| `.github/workflows/ci.yml` | `content-guard` | `scripts/content-guard.mjs`: the private denylist, franchise IP, IPv4 addresses and internal hostnames ([below](#content-guard)) |
| `.github/workflows/ac-trace.yml` | `gate` | the acceptance-criteria gate for the issue the PR closes |
| `.github/workflows/plan.yml` | `validate` | plan and tracer validation (only when `docs/plan`, `docs/evidence` or `scripts` change) |

## Branch protection

`main` is protected. To recreate the rule (Settings → Branches, or the API call below):

- Require a pull request before merging
- Require status checks to pass, with the branch up to date. Required checks (named exactly as above):
  - `verify`
  - `content-guard`
  - `gate`
- Do not allow force pushes or deletions

`validate` isn't required because it only runs when the plan or scripts change; a required check that
never starts would block every other PR.

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verify", "content-guard", "gate"] },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

## Content guard

The repository and the site are public, so `content-guard` fails a PR that adds any of these:

| Category | What it catches | Where the rule lives |
|---|---|---|
| `private-denylist` | names, hosts and terms from the operator's real environment | the `CONTENT_DENYLIST` Actions secret, never committed |
| `franchise-ip` | names, places and props from the fantasy franchises the world must not borrow from | `scripts/ip-denylist.txt` |
| `ipv4` | any IPv4 address outside RFC 5737 (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`), the simulator's pod and service CIDRs (`10.244.0.0/16`, `10.96.0.0/12`) and loopback | `scripts/content-guard.mjs` |
| `hostname` | hostnames under `.mil` or `.gov`, or ending `.internal` or `.corp` | `scripts/content-guard.mjs` |

It prints `file:line  category`, plus the match for the public categories. For the private denylist it prints
the category only, so neither the pattern nor the matched text reaches a log. Run it locally with
`node scripts/content-guard.mjs`.

### Setting the private denylist

The secret is newline-separated, case-insensitive regular expressions, one per line (`#` comments allowed).
Only a repository admin can set it:

```bash
gh secret set CONTENT_DENYLIST < denylist.txt   # a file outside the repo; delete it afterwards
```

When the secret is absent (a fork, or a run without secrets), the check warns and skips the private list
instead of failing. To test patterns locally, export `CONTENT_DENYLIST` in your shell before running the
script; never write them into a file in the repo.

### Requesting an exception

If something legitimate is flagged, first try to change the content: use `*.example` domains, RFC 5737
addresses and the fictional Ravenpost system. If an exception is unavoidable, add a line to
`scripts/content-guard-allow.txt` with the path glob, the category (`franchise-ip`, `ipv4` or `hostname`)
and a comment saying why. Explain it in the PR; the lead approves it. The private denylist can't be excepted.
