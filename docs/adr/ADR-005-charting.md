# ADR-005: Charting library

- **Status:** Accepted
- **Date:** 2026-11-23

## Context
The Grafana-style dashboards (E8-02), PromQL explorer (E8-03), SLO views and capstone war room need
time-series panels. The criteria from E0-07 are SVG output, accessibility, bundle size and time-series
ergonomics. Budgets: initial JS ≤ 250 KB gzipped (sim tool UIs are code-split, but every KB still costs on
first load of a tool), and a panel with 6 hours of data renders in < 100 ms. Every chart has a data-table
alternative regardless of library (ROADMAP §4).

## Decision
**visx** (`@visx/scale`, `@visx/shape`, `@visx/axis`, `@visx/group`, `@visx/tooltip`, `@visx/event`), with
`d3-array` for bisecting and extents. We build a small `TimeSeriesPanel` on top: SVG, a table alternative,
keyboard-movable crosshair, and tokens for colors.

### Spike: one 6-hour panel in each library
The same panel in each library: two series of 1,440 points (15-second samples), time axis, y axis,
legend and hover tooltip, with animation off. The spike is in [`spikes/005-charting/`](spikes/005-charting/);
reproduce with `cd docs/adr/spikes/005-charting && npm ci && npx playwright install chromium && npm run measure`.

| Build | JS gzipped | Over baseline | Median render, 6 h of data |
|---|---:|---:|---:|
| Baseline (React, data, a table) | 66.5 KB | — | 8.9 ms |
| Recharts 3.11.1 | 176.9 KB | **+110.5 KB** | **169.0 ms** |
| visx 4.0.0 | 91.2 KB | **+24.7 KB** | **36.4 ms** |

Measured 2026-11-23 with Vite 8 production builds; gzip level 9 over all emitted JS; render time is the
median of 9 loads in headless Chromium 159, from `createRoot` until both 1,440-point paths are in the DOM.

| Criterion | visx | Recharts |
|---|---|---|
| SVG output | Yes | Yes |
| Accessibility | Nothing built in: we add `role="img"`, labels, a keyboard crosshair and the table ourselves | `accessibilityLayer` gives arrow-key tooltip movement; still needs labels and the table |
| Bundle size | +24.7 KB, and only the modules we import | +110.5 KB, mostly unavoidable |
| Render, 6 h | 36 ms: within the 100 ms budget | 169 ms: **over** the 100 ms budget |
| Time-series ergonomics | d3 time scales and ticks directly; we write the panel | Needs `type="number" scale="time"` and formatters; declarative once set up |

## Consequences
- We own a `TimeSeriesPanel` component (axes, crosshair, tooltip, keyboard, table), roughly 200 lines plus
  tests. It's one component reused by every panel, and its accessibility is under our control and tested.
- Panels stay well inside the render budget and add little to each tool's chunk.
- d3 scales and time ticks are available directly for PromQL step alignment and exemplar markers.

## Alternatives considered
- **Recharts:** faster to write a first chart and has a useful keyboard layer, but it is over the 100 ms
  render budget at 6 hours of data and adds about 4.5 times the bytes. It would need sampling or virtualizing
  that visx doesn't.
- **uPlot / Canvas libraries:** very fast and small, but Canvas output is opaque to assistive technology and
  to axe, so every chart would need a parallel accessible rendering.
- **Hand-rolled d3 without visx:** possible, but visx already wraps the scales, axes and shapes in React
  without a second DOM-manipulation model.
