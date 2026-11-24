# Verifying acceptance criteria

Every criterion in [`docs/plan/epics/`](../plan/epics/) has a stable tag:

| Kind | Example in the plan | Tag |
|---|---|---|
| Issue acceptance criterion | `- [ ] `AC2` Parser never throws…` under **E6-04** | `E6-04.AC2` |
| Epic success criterion | `- [ ] `SC1` Supported command matrix…` under **E6** | `E6.SC1` |
| Manual criterion | `- [ ] `AC3` `manual` Ben signs off…` | `E1-01.AC3` (evidence, not a test) |

**Never renumber an existing criterion.** If one becomes obsolete, strike it through and mark it `manual` with evidence explaining why. Add new criteria at the end.

## Automated criteria: tag the test title

The tag goes in square brackets at the start of the test title. One test may cover several criteria, and one criterion may have several tests.

```ts
// Vitest (src/sim/commands/parser.test.ts)
it('[E6-04.AC1] never throws on 10,000 random inputs', () => { /* fast-check */ });

// Playwright (e2e/skeleton.spec.ts)
test('[E5-07.AC1] [E3.SC1] landing → quiz → lesson → resume on the deployed site', async ({ page }) => { /* … */ });
```

Or use the helpers, which build the prefix and reject malformed tags. The tracer reads the tags from the
call's first argument, even when a formatter wraps it onto the next lines:

```ts
import { acTest } from '@/test/ac'        // Vitest (src/test/ac.ts)
import { acTest } from './ac.ts'          // Playwright (e2e/ac.ts), with the shared fixtures
acTest('E6-04.AC1', 'never throws on 10,000 random inputs', () => { /* … */ })
acTest(['E5-07.AC1', 'E3.SC1'], 'landing → quiz → lesson → resume', async ({ page }) => { /* … */ })
```

A criterion counts as traced only when **all** of these are true:
- A test title carries the tag
- The test isn't skipped in source (`.skip`, `.todo`, `.fixme`, `xit`)
- In CI, the JUnit report from that run shows it **ran and passed** at least once, and **failed nowhere**
  (`--junit`). A run skipped at runtime, such as a test that only runs in Chromium, is neutral: it
  neither counts nor cancels a pass elsewhere.

## Manual criteria: write evidence

Create or extend `docs/evidence/<ISSUE-ID>.md` (or `<EPIC-ID>.md` for success criteria):

```markdown
## E6-09.AC1
NVDA 2025.3 + Firefox 140, Windows 11: typed `kubectl get pods -n ravenpost`; NVDA announced
"command: kubectl get pods…" then "4 lines of output, press Alt+O to read". VoiceOver + Safari 19: same.
Recording: <link to PR attachment>
```

Evidence must be non-empty. CODEOWNERS requires the SME/lead's approval for anything under `docs/evidence/`.

## Running the tracer

```bash
python3 scripts/ac-trace.py                       # summary
python3 scripts/ac-trace.py --issue E6-04         # what's left for one issue (strict)
python3 scripts/ac-trace.py --report out.md       # full matrix
python3 scripts/ac-trace.py --strict-all          # launch gate: everything traced
python3 -m unittest discover scripts/tests        # the tracer's own tests
```

## In CI
- **`plan`** validates the plan, runs the tracer's unit tests, and publishes the matrix on every change.
- **`gate`** (in `ci.yml`, after `verify` and `e2e`) runs the tracer's unit tests, checks that the committed
  `docs/plan/AC-TRACEABILITY.md` is current, reads `Closes #n` from the PR body (`scripts/pr-issues.py`), maps
  `#n` to its plan ID via `docs/plan/issue-map.json`, and fails the PR if any criterion of that issue is
  untraced **against the JUnit results of that same run**. It publishes the matrix to the job summary.
- Editing the PR body re-runs CI, so adding `Closes #n` takes effect.
- After adding tagged tests or evidence, refresh the committed matrix:
  `python3 scripts/ac-trace.py --report docs/plan/AC-TRACEABILITY.md`.
- Tags that don't match any criterion (typos or stale IDs) always fail.

```mermaid
flowchart LR
    PR["PR body: Closes #57"] --> MAP["issue-map.json<br/>#57 → E6-04"]
    MAP --> TR["ac-trace.py --issue E6-04<br/>--junit vitest.xml playwright.xml"]
    TESTS["Tests titled [E6-04.ACn]"] --> TR
    EV["docs/evidence/E6-04.md"] --> TR
    TR -->|all traced| OK["✅ mergeable"]
    TR -->|gaps / unknown tags| NO["❌ lists what's missing"]
```
