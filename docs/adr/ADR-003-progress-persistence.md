# ADR-003: Progress persistence and the export code

- **Status:** Accepted
- **Date:** 2026-11-23

## Context
There is no backend and no account. A learner's placement, completed lessons, preferences and capstone
state must survive reloads and browser restarts, move to another browser or machine, and be readable by a
lead without a server. No PII may be collected. The format will change over the project's life, and a
corrupt or tampered value must never crash the app.

## Decision
- **One versioned key in `localStorage`** (`btg:progress`), holding `{ schemaVersion, data }` and validated
  with Zod on every read.
- **Migrations** are pure functions from version N to N+1, run in order on load and tested against stored
  fixtures of every past version (E3-02). A value that fails validation is backed up to a separate key and
  the learner is offered recovery, never a crash.
- **Export code:** JSON → deflate (`CompressionStream`) → base64url, with a checksum so a mistyped or
  truncated code is rejected with a kind message. It can also be downloaded as a `.json` file.
- **Lead view:** a lead pastes a code and sees a read-only summary, decoded entirely in the browser.
- **Multi-tab:** `storage` events keep tabs in step; the last write wins per field (E3-04).
- The codec and migrations live in framework-free `src/progress/`.

## Consequences
- Works offline and on restricted networks, with nothing to host or secure server-side.
- Progress lives in one browser profile unless exported; clearing site data loses it. The app says so in
  Settings and prompts an export after milestones.
- `localStorage` is synchronous and about 5 MB; progress must stay small (no telemetry or replay logs).
- A display name is optional and stays local.

## Alternatives considered
- **IndexedDB:** more capacity and asynchronous, but more complex, and progress is small. Revisit if
  capstone state grows.
- **Cookies:** sent with every request, size-limited, and no benefit without a server.
- **A backend with accounts:** explicitly a non-goal for v1 (ROADMAP §1).
- **Uncompressed base64 JSON codes:** too long to paste comfortably into chat or a ticket.
