# ADR-006: A custom accessible terminal instead of xterm.js

- **Status:** Accepted
- **Date:** 2026-11-23

## Context
The terminal is the main practice surface: learners type `kubectl` and `argocd` commands against the
simulator and read the output. It must work with NVDA, JAWS and VoiceOver, be operable by keyboard alone,
reflow at 400% zoom and meet WCAG 2.2 AA. It doesn't need a real PTY, curses applications or escape-code
fidelity: every command is simulated.

## Decision
Build our own terminal component (E6-09) from semantic HTML:
- A labelled text `<input>` for the command line, with history (Up/Down), Tab completion from the command
  registry, and Ctrl+L / Ctrl+C.
- Output as a list of command/result blocks in real DOM text, styled with the mono typeface and tokens, not a
  canvas or a cell grid.
- New output announced through a polite live region with a summary ("4 lines of output"), plus a shortcut to
  move focus into the latest output for line-by-line reading.
- Wide tables (`kubectl get -o wide`) scroll horizontally inside their own focusable, labelled region, so the
  page still reflows.

## Consequences
- Screen readers read real text, search, selection and zoom work natively, and axe can audit it.
- We implement only what the simulator needs: no ANSI escape parsing beyond a small color subset, and no
  cursor-addressed full-screen programs. `kubectl edit` opens our own editor panel instead (E6-08).
- We own keyboard handling and its tests, including not trapping focus (Escape and Tab leave the terminal).

## Alternatives considered
- **xterm.js:** high fidelity and widely used, but it renders to a canvas or cell grid. Its screen-reader mode
  is an add-on with known gaps (announcing output, reading earlier lines), and it doesn't reflow at high zoom.
  It also adds 118 KB gzipped (`@xterm/xterm` 6.0.0, measured 2026-11-23) for fidelity we don't use.
- **A read-only `<pre>` with a separate input:** simplest, but loses the feel of a terminal session and makes
  history and completion awkward.
