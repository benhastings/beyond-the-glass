# E1 · Design system & the world
<!-- epic: milestone=M2; labels=area:design -->

**Goal:** A visual identity and component kit that make the journey feel like stepping out of a dim 1998 ops room into a living world, while staying accessible to everyone.

**Epic success criteria**
- [ ] `SC1` Every color pairing in the token set meets WCAG 2.2 AA contrast (4.5:1 text, 3:1 UI/large text), verified by an automated test
- [ ] `SC2` Every animation has a reduced-motion equivalent; with `prefers-reduced-motion: reduce`, nothing moves more than a fade
- [ ] `SC3` `manual` At least 3 of 5 pilot users describe the look as "engaging" or similar, unprompted, in usability sessions (E11-04)
- [ ] `SC4` `manual` No franchise IP appears in any asset (E0-06 passes, and the art direction review is signed off)

---

## E1-01 · Art direction brief and design tokens
<!-- meta: milestone=M0; size=M; labels=area:design,type:design,needs-human; depends= -->

**Context:** This anchors every visual choice an agent makes. Read ROADMAP §3 first.

**Scope:** Write `docs/design/art-direction.md` containing:
- **Two moods**: *Console* (dark, phosphor green/amber CRT glow, beige hardware, scanlines used sparingly) and *Reach* (luminous, natural, painterly; dawn light; distinct accent per region)
- Region palettes and motifs: Harbor, Helm Keep, Chartroom, Mirror Lake, Signalwood, Stormwatch
- Typography: one humanist sans for body text, one monospace for the terminal, one display face for headings. All self-hosted and open-licensed (OFL), with license files committed.
- Illustration style rules: layered flat SVG, limited palette per scene, no franchise imagery (list explicitly what to avoid)
- Motion principles: duration scale, easing, what may animate, reduced-motion behavior
- Design tokens exported as `src/app/styles/tokens.css` (CSS variables) + `tokens.ts`

**Acceptance criteria**
- [ ] `AC1` `manual` Doc includes a moodboard of **original** sketches or descriptions (no copyrighted reference images committed)
- [ ] `AC2` Token contrast test (`tokens.test.ts`) checks every declared foreground/background pair against AA and passes
- [ ] `AC3` `manual` Ben signs off in the PR (label `needs-human`)

---

## E1-02 · Theming, tokens and user display preferences
<!-- meta: milestone=M1; size=S; labels=area:design,type:feature; depends=E0-01,E1-01 -->

**Scope**
- Wire tokens into Tailwind theme; `data-mood="console|reach"` and `data-region="<id>"` attributes switch palettes
- Respect `prefers-reduced-motion`, `prefers-contrast: more` and `forced-colors`
- User overrides (stored via progress store): reduce motion, high contrast, text size (100/115/130%)

**Acceptance criteria**
- [ ] `AC1` Switching region updates accent colors with no layout shift
- [ ] `AC2` Windows High Contrast (forced-colors) emulation in Playwright shows all controls with visible boundaries
- [ ] `AC3` Text size 130% causes no clipped or overlapping text on any route (Playwright screenshot check at 1280×720)

---

## E1-03 · Accessible component primitives
<!-- meta: milestone=M1; size=M; labels=area:design,type:feature; depends=E1-02 -->

**Scope:** Build on Radix: Button, IconButton (requires label), Card, Dialog, Tabs, RadioGroup, Checkbox, Progress, Tooltip (also triggered by focus), Callout (info/warn/success/ELI5), Kbd, CodeBlock (copy button, language label), Badge/StatusPill, SkipLink, VisuallyHidden, Toast (polite live region).

**Acceptance criteria**
- [ ] `AC1` Each component has unit tests covering keyboard interaction and ARIA roles, and a demo on a dev-only `/#/kitchen-sink` route
- [ ] `AC2` Kitchen-sink route passes axe with 0 violations in all three browsers
- [ ] `AC3` Focus ring is visible on every interactive element in both moods (≥ 3:1 against adjacent colors)
- [ ] `AC4` StatusPill never conveys status by color alone (icon + text)

---

## E1-04 · Console Room scene illustration
<!-- meta: milestone=M2; size=M; labels=area:design,type:design; depends=E1-01 -->

**Scope**
- Layered SVG scene: desk, CRT monitors (one designated as "the glass"), beige tower, pager, wall of status lights, window with night sky, coffee mug
- Layers exported separately for parallax and the crossing animation
- Subtle idle animation (blinking status lights, CRT flicker ≤ 3 Hz equivalent luminance change, **no flashing** above WCAG 2.3.1 thresholds)

**Acceptance criteria**
- [ ] `AC1` Total scene assets ≤ 120 KB gzipped
- [ ] `AC2` Scene is decorative (`aria-hidden`) and paired with a concise text description available to screen readers on the landing view
- [ ] `AC3` Idle animation fully stops under reduced motion
- [ ] `AC4` `manual` Original artwork, signed off against the art direction doc

---

## E1-05 · Region vignettes and world map art
<!-- meta: milestone=M2; size=L; labels=area:design,type:design; depends=E1-01 -->

**Scope**
- One header vignette per region (6) in the shared style
- World map of the Reach showing the six regions and the trail connecting them, layered so regions can be highlighted or dimmed

**Acceptance criteria**
- [ ] `AC1` Each vignette ≤ 60 KB gzipped; map ≤ 150 KB gzipped
- [ ] `AC2` Map regions are separate SVG groups with stable IDs matching content region IDs
- [ ] `AC3` `manual` Visual style review sign-off; content-guard passes

---

## E1-06 · The Crossing: step-through-the-glass transition
<!-- meta: milestone=M2; size=M; labels=area:design,type:feature; depends=E1-04,E1-05,E2-01 -->

**Context:** This is the signature moment. It plays after the Threshold quiz results, when the learner first enters the Reach.

**Scope**
- Sequence: camera pushes toward the glass monitor → the screen ripples like water → light spills through → the Reach map is revealed with ambient motion (leaves, light shafts)
- Duration ≤ 3.0 s; **Skip** button focusable immediately; Esc skips
- Plays automatically once; replayable from Settings
- Reduced motion: a 400 ms crossfade with a single line of narrative text

**Acceptance criteria**
- [ ] `AC1` `manual` No frame drops below 50 fps on a mid-range laptop (Chrome performance trace attached to PR)
- [ ] `AC2` No content flashes more than 3 times per second (WCAG 2.3.1)
- [ ] `AC3` After the crossing, focus moves to the map heading and the screen reader announces the arrival text
- [ ] `AC4` Playwright test covers: plays once, skip works, replay works, reduced-motion path
