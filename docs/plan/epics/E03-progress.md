# E3 · Progress & persistence
<!-- epic: milestone=M1; labels=area:progress -->

**Goal:** Learners never lose progress, can move it between browsers with a code, and can show a lead where they are, all without a backend.

**Epic success criteria**
- [ ] `SC1` Progress survives reload, tab close and browser restart (Playwright)
- [ ] `SC2` Export → import round-trips with zero loss, verified by a property-based test over randomly generated progress states
- [ ] `SC3` A corrupted or outdated store never crashes the app: it migrates or recovers with a clear notice
- [ ] `SC4` A lead can paste a learner's code and see a readable summary in under 10 seconds

---

## E3-01 · Progress store and schema
<!-- meta: milestone=M1; size=M; labels=area:progress,type:feature; depends=E0-01 -->

**Scope**
- Zustand store with persist middleware under key `btg:progress`, with Zod schema `ProgressV1` containing:
  - `schemaVersion`, `createdAt`, `updatedAt`, optional `displayName`
  - `threshold`: answers, completedAt, placement result (per-domain levels), overrides
  - `lessons`: per lesson → current step, completed steps, completedAt, depth-layer preference
  - `checks`: per check → attempts, passed, lastAnswer
  - `challenges`: per challenge → status, hintsUsed, commandsRun count, completedAt
  - `scenarios`: per scenario → serialized sim snapshot (for mid-scenario resume), act, notes
  - `settings`: display preferences
- Selectors/hooks for common queries (region completion %, next recommended step)
- Debounced writes (≤ 1 per 500 ms); synchronous flush on `pagehide`

**Acceptance criteria**
- [ ] `AC1` Schema is the single source of truth: TS types inferred from Zod
- [ ] `AC2` Unit tests for all selectors; ≥ 90% coverage
- [ ] `AC3` Storage quota exceeded is caught and surfaced as a toast suggesting export, without crashing
- [ ] `AC4` No PII fields other than an optional display name

---

## E3-02 · Schema migrations and corruption recovery
<!-- meta: milestone=M1; size=S; labels=area:progress,type:feature; depends=E3-01 -->

**Scope**
- Migration registry: `migrations[n]` upgrades vN → vN+1; runs on load
- If parsing fails, copy the raw value to `btg:progress:backup:<timestamp>`, start fresh, and show a dialog with a "Download the old data" button

**Acceptance criteria**
- [ ] `AC1` Tests: a v1 fixture migrates through a dummy v2 migration; garbage JSON triggers recovery; partial objects are repaired when possible
- [ ] `AC2` Recovery dialog is accessible and appears exactly once per incident

---

## E3-03 · Export / import progress code
<!-- meta: milestone=M1; size=M; labels=area:progress,type:feature; depends=E3-01 -->

**Scope**
- Codec: `JSON → deflate-raw (CompressionStream) → base64url`, prefixed `BTG1.` and suffixed with a CRC32 checksum
- Fallback to uncompressed base64url when `CompressionStream` is unavailable
- Download as `beyond-the-glass-progress-YYYY-MM-DD.json`; import from paste or file
- On import: validate, show a summary preview, then **Replace** or **Merge** (merge keeps the furthest progress per item)

**Acceptance criteria**
- [ ] `AC1` Property-based test (fast-check): `decode(encode(p))` deep-equals `p` for 1,000 generated states
- [ ] `AC2` A full-journey progress state encodes to ≤ 4 KB code length
- [ ] `AC3` Tampered or truncated codes are rejected with a human-readable message
- [ ] `AC4` Merge semantics covered by tests (completed beats in-progress; later timestamp wins for settings)

---

## E3-04 · Resume and multi-tab safety
<!-- meta: milestone=M1; size=S; labels=area:progress,type:feature; depends=E3-01,E2-01 -->

**Scope**
- Track `lastLocation` (route + step); the "Continue" CTA deep-links there
- Subtle autosave indicator ("Saved" with timestamp in a polite live region, announced at most once per minute)
- `storage` event listener keeps open tabs in sync; last write wins, with a toast if another tab changed progress

**Acceptance criteria**
- [ ] `AC1` Playwright: complete a step in tab A, see it reflected in tab B within 1 s
- [ ] `AC2` Closing mid-lesson and reopening resumes at the same step, with the terminal history restored for that step

---

## E3-05 · Lead view: read a learner's progress code
<!-- meta: milestone=M4; size=S; labels=area:progress,type:feature; depends=E3-03,E5-01 -->

**Scope**
- `/lead` route: paste one or more codes (one per line), and see a table with name (if provided), placement per domain, regions complete, capstone status and last activity date
- Read-only; nothing from pasted codes is stored
- "Print summary" button

**Acceptance criteria**
- [ ] `AC1` Handles 20 codes in < 1 s
- [ ] `AC2` Invalid codes are reported per line without blocking valid ones
- [ ] `AC3` Table is a real `<table>` with headers, sortable by keyboard
- [ ] `AC4` Nothing pasted is written to localStorage (test asserts storage unchanged)
