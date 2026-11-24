# Art direction

The written spec for how Beyond the Glass looks and moves (E1-01). It turns the approved concept screens into
rules and tokens an agent or designer can follow without asking. It doesn't reopen the direction: see
[`README.md`](README.md) for what was approved and why, and [`visual-brief.md`](visual-brief.md) for the brief
the concepts answered. Where this file and a concept disagree, this file wins; where either disagrees with the
brief's rules on accessibility, original IP or tone, the brief wins.

**Tokens:** [`src/app/styles/tokens.ts`](../../src/app/styles/tokens.ts) is the source. It generates
[`tokens.css`](../../src/app/styles/tokens.css) (`node scripts/build-tokens.mjs`), and `tokens.test.ts` checks
every foreground/background pair the tokens allow against WCAG 2.2 AA. Use tokens, never raw hex values, in
app code.

## The concept screens

All seven are in [`concepts/approved/`](concepts/approved/) and open in a browser. They're reference mockups:
they load fonts from Google, which the app must never do, and some of their copy is placeholder (see
[review point 2](#review-points-settled)).

| Screen | File | Mood |
|---|---|---|
| 1 · Console Room: journey overview | [`Main.dc.html`](concepts/approved/Main.dc.html) | Console Room |
| 2 · The Threshold: placement quiz | [`Threshold.dc.html`](concepts/approved/Threshold.dc.html) | Console Room |
| 3 · Your trail: results | [`Trail.dc.html`](concepts/approved/Trail.dc.html) | Console Room |
| 4 · The Crossing: storyboard | [`Crossing.dc.html`](concepts/approved/Crossing.dc.html) | Console Room → the Reach |
| 5 · The Reach: journey map | [`Reach.dc.html`](concepts/approved/Reach.dc.html) | The Reach (every region's vignette) |
| 6 · Chartroom lesson with the terminal | [`Lesson.dc.html`](concepts/approved/Lesson.dc.html) | The Reach (Chartroom) |
| 7 · Stormwatch war room | [`WarRoom.dc.html`](concepts/approved/WarRoom.dc.html) | Stormwatch |

No copyrighted or third-party reference images are committed anywhere in the repository: the concepts are
hand-built HTML and inline SVG.

## Three moods

A mood is a complete palette. The page sets one with `data-mood` on the root (E1-02); everything inside uses
the semantic roles below, so one component works in all three.

| Role | What it's for | Console Room | The Reach | Stormwatch |
|---|---|---|---|---|
| `ground` | Page background | `#12151A` | `#EEF5F1` | `#0E1220` |
| `surface` | Cards, panels, header | `#1A1F27` | `#FFFFFF` | `#171C2E` |
| `raised` | A panel inside a surface | `#232A34` | `#E3F9F4` | `#232A42` |
| `ink` | Body text | `#D3D8DE` | `#10272C` | `#E8EBF5` |
| `ink-muted` | Captions, labels, meta (still ≥ 4.5:1) | `#B9C0C9` | `#2F4A4E` | `#B4BBD3` |
| `link` | Links | `#7DE8D8` | `#0A5A61` | `#7DE8D8` |
| `line` | Borders, input edges (≥ 3:1; never text) | `#7A8596` | `#6F8A8C` | `#7680A6` |
| `focus` | Focus ring | `#FFD35C` | `#10272C` | `#FFD35C` |
| `accent` / `accent-ink` | Primary action and its text | `#7DE8D8` / `#06282B` | `#0A5A61` / `#FFFFFF` | `#FFD35C` / `#0E1220` |
| `ok` · `warn` · `alert` · `info` | Status, always with an icon and words | `#6FE0A0` · `#FFB84D` · `#FF8A78` · `#7DE8D8` | `#1F6B3A` · `#8A4B17` · `#A6362A` · `#0A5A61` | `#8BE0B4` · `#FFB84D` · `#FFA07A` · `#C7A6FF` |

Three values differ slightly from the concepts so that every pair passes in every place it can appear: the
`line` greys are a step lighter in the two dark moods (the concepts' `#6B7686` and `#6A7396` reached 3:1 on
the ground but not on panels), and the alert reds are adjusted for the darker or lighter surfaces.

### Console Room
Overview, the Threshold and your trail. A dim operations room around 1998: near-black blue-grey, beige CRT
plastic (`console-plastic #EFE9DC` with `#12151A` text on it), amber and green phosphor (`#FFB84D`, `#6FE0A0`).

**Aqua `#7DE8D8` is the glass.** In the Console Room it is the only living colour: the glowing monitor, and the
things you can act on (links and the primary action), because acting is how you reach the glass. It is never
decoration, a background fill or a status colour (status `info` reuses it only alongside an icon and words).
Focus is lightning yellow `#FFD35C`, so it never blends with aqua.

### The Reach
The map and every lesson. Luminous, cut-paper landscapes: pale mist green ground, white surfaces, deep lagoon
teal ink, and sun-gold (`reach-sun #FFB84D`, `reach-sun-pale #FFF3C9`) for highlights such as the selected map
pin and the "Then → Now" analogy box, always with `ink` text on top. Each region adds its own accent
([below](#regions)).

### Stormwatch
The capstone war room. Indigo night, panels separated by `stormwatch-panel #39405C` dividers (decorative;
interactive boundaries use `line`). Lightning yellow `#FFD35C` marks focus and the act's objectives; coral
`#FFA07A` marks alerts, always with an icon and words. Violet `#C7A6FF` is for traces. The `prod` context
in a prompt is shown in the warning colour **and** spelled out.

### The terminal
The same in every mood, so it always reads as the cluster rather than the world: `term-ground #0F1A1D`,
`term-surface #1A2A2E`, `term-ink #E6EFE9`, a muted `#B9C8C4`, an aqua prompt `#7DE8D8`, and a yellow focus
ring. Output uses the mono face at body size.

## Regions

Each region gets a text-safe `accent` (≥ 4.5:1 on every Reach surface, with white text on it), a `soft` tint for
its header and cards (Reach ink, muted ink and `line` all pass on it), and motif colours for its vignette. The
page sets `data-region` (E1-02) and components use `--color-region-accent` and `--color-region-soft`. The
vignettes are drawn in the map concept, [`Reach.dc.html`](concepts/approved/Reach.dc.html).

| Region | Accent | Soft | Motif colours | Vignette |
|---|---|---|---|---|
| Console Room | `#0A5A61` | `#E3F9F4` | `#7DE8D8` `#EFE9DC` `#FFB84D` `#6FE0A0` | A beige CRT with the glowing glass, a status-light wall, the doorway the trail starts from |
| The Harbor | `#156A70` | `#E6F4F4` | `#156A70` `#EF7F5A` `#FFB84D` `#E3F9F4` | Deep harbour water, stacked shipping containers in coral, gold and mist, a dockside crane |
| Helm Keep | `#6F5B93` | `#ECE8F4` | `#6F5B93` `#2B2147` `#FFB84D` | A violet-stone keep with a gold pennant. Its stewards are implied by order, never drawn |
| The Chartroom | `#8A4B17` | `#FBEEDD` | `#B0652A` `#FFF3C9` `#FFB84D` | A brass dome and instruments, a compass rose, charts on warm paper |
| Mirror Lake | `#1F6787` | `#E4F1F6` | `#9FE6DA` `#3F9D8B` `#E3F9F4` `#FFFBE6` | Still water reflecting the shore (desired state); ripple rings on the surface are drift |
| Signalwood | `#2F6B3A` | `#E4F2E7` | `#1F6B62` `#58C98A` `#FFD35C` | A layered forest; gold firefly points are signals passing between the trees |
| Stormwatch | `#3B4368` | `#E7E9F2` | `#3B4368` `#2B2147` `#FFD35C` | A watchtower on a cliff under indigo cloud, one lit window, a single stroke of lightning |

The Chartroom's brass (`#B0652A`) and Mirror Lake's teal (`#3F9D8B`) stay in the illustrations; as text they
fell short of 4.5:1, so their accents are the deeper `#8A4B17` and a lake blue, `#1F6787`.

### Recurring motifs
- **Ripple rings:** concentric rings expanding from a point. They're the glass: they appear on the Console
  Room's monitor, in the Crossing, around the "you are here" marker on the map, and on Mirror Lake (as drift).
  Rings are drawn as strokes, 2–2.5 px, at reduced opacity, never filled.
- **Waystones:** small standing stones that mark levels and progress. Four waystones are the four levels
  (Wayfarer, Deckhand, Navigator, Pathfinder); a lit stone is a level reached. They never show a number or a
  fraction ([review point 1](#review-points-settled)), and the level's name and meaning are always in text
  beside them.

## Typography

All three typefaces are open-licensed (SIL OFL 1.1), self-hosted and subset to the characters we use: Basic
Latin, Latin-1, general punctuation and the arrows and marks the UI draws (→ ↑ ↓ ▸ ✓ ·). The licences ship
with the site under `/licenses/fonts/`; `scripts/fonts/build-fonts.py` rebuilds the subsets. Nothing is ever
loaded from a font service.

| Use | Typeface | Weights | Token |
|---|---|---|---|
| Display: page titles, region names, the hook | **Bricolage Grotesque** (optical size fixed at 36) | 600–800 | `--font-display` |
| Body, UI, buttons, quiz options | **Atkinson Hyperlegible Next**, designed for low-vision readers | 400–700, italic | `--font-sans` |
| Terminal, queries, code, labels in charts | **Atkinson Hyperlegible Mono** | 400–700 | `--font-mono` |

- **Scale** (`--text-*`, rem): xs 0.875 · sm 1 · **base 1.125 (18 px)** · lg 1.375 · xl 1.75 · 2xl 2.25 · 3xl 3 ·
  4xl 4. Body text is 18 px, as in every concept; nothing a learner must read is below 14 px.
- **Line height:** body 1.55, headings 1.15, mono 1.5.
- Headings `h1`–`h3` use the display face; everything else uses the body face.
- Text-size settings (100 / 115 / 130 %, E1-02) scale the root, so every rem-based size follows.
- Never set long passages in the display face, in all caps, or in the mono face (except terminal output).

## Illustration

- **Flat, layered cut-paper SVG.** Shapes are solid fills stacked in depth; no gradients except the soft
  sky and the glow behind the glass. No outlines except where a shape needs separating from the ground.
- **A limited palette per scene:** the region's motif colours plus the mood's ink and ground. At most six
  colours in one vignette.
- **Every illustration is decorative or described.** Decorative art is `aria-hidden`; anything that carries
  information (the map, a status) has a text equivalent next to it.
- Scenes are SVG, inline or as files, sized for any width; art may be swapped for commissioned work later
  without code changes (ROADMAP §7).

**Never draw:**
- People, faces, hands or silhouettes of people (stewards, watchers and operators are implied, never shown)
- Animals, mythical creatures or talking anything
- Any product logo or mark: Kubernetes, Argo, GitLab, Grafana, Prometheus, OpenTelemetry, Docker, cloud
  providers. Mock tool screens evoke a layout; they never copy one pixel for pixel
- Anything from a fantasy franchise's world: its characters, creatures, places or iconic props, including
  a lone street lamp in a snowy wood or a doorway hidden in furniture. `scripts/ip-denylist.txt` lists the
  names to avoid, and content-guard enforces it
- Real places, landmarks, maps, flags, agencies or organisations
- Screenshots of real tools, real hostnames or real data

## Motion

Motion explains a change of place or state; it never decorates, loops for attention or delays the learner.

| Token | Value | Use |
|---|---|---|
| `--duration-quick` | 120 ms | Hover, press, small state changes; the stagger between ripple rings |
| `--duration-base` | 200 ms | Panels opening, tabs, toasts |
| `--duration-slow` | 400 ms | Page transitions, and the reduced-motion crossfade for the Crossing |
| `--duration-crossing-push` / `-ripple` / `-arrive` | 900 / 1000 / 900 ms | The Crossing's three phases (2.8 s total, under the 3 s ceiling) |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Most movement |
| `--ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | Leaving: the Crossing's push in |
| `--ease-out` | `cubic-bezier(0, 0, 0.2, 1)` | Arriving: the Crossing's arrival |

**What may animate:** opacity, transform (translate and scale) and colour. Never layout properties, and never
anything the learner is reading or typing into.

**Never:** flashes (nothing brightens more than three times a second, and the glass brightens once and
holds), parallax tied to scrolling, autoplaying loops longer than 5 seconds, or motion that must finish
before the learner can act. Every animation can be skipped or is short enough not to need skipping.

**Reduced motion** (`prefers-reduced-motion: reduce`, or the in-app setting, E1-02): nothing moves more than a
fade. Transforms are removed, loops stop (the glass rests at 85 % brightness instead of breathing), and the
Crossing becomes a 400 ms crossfade, with Skip still offered.

## Shape and focus

- **Radius:** sm 6 px, md 10 px (cards, inputs, focus rings), lg 16 px (panels), pill for tags.
- **Focus:** a 3 px solid ring in the mood's `focus` colour, offset 3 px, on every interactive element. It is
  never removed, only restyled. Inside the terminal it's lightning yellow in every mood.
- **Targets:** at least 44 × 44 px for anything clickable or tappable.
- **Status** always pairs a colour with an icon and a word (for example a check mark and "Complete"),
  never colour alone.

## Applying moods, regions and display preferences

How the tokens reach the page (E1-02):

- **Mood and region:** every page renders `<Page mood="…" region="…">` (default mood: the Reach). Page sets
  `data-mood` and `data-region` on `<html>` before the page paints, and the region tokens
  (`--color-region-accent`, `--color-region-soft`) follow. Use the region accent for text only in the Reach
  mood; regions in the other moods (the Console Room, Stormwatch) use that mood's palette instead.
- **Display preferences** come from the learner's settings (stored with their progress), and "system" follows
  the operating system. The shell writes them onto `<html>`:
  - `data-motion="reduce"` when reduce motion is on (or "system" and the OS asks): no animations, and only
    colour and opacity may transition.
  - `data-contrast="more"` when high contrast is on (or "system" and the OS asks for more contrast): the
    high-contrast palette in `tokens.ts` replaces ink, muted ink, links and boundaries, reaching 7:1 for text
    and 4.5:1 for boundaries.
  - The root font size (100, 115 or 130 %): every rem-based size scales with it, so nothing may be sized
    in pixels where text could grow.
- **Forced colours** (Windows High Contrast): `display.css` gives every control a system-coloured border,
  keeps links underlined, and draws focus in the system highlight colour. Never rely on a background or box
  shadow alone to show where a control is.

## Review points settled

The five open questions from the concept review, all decided as recommended (Ben, 2026-11-24):

1. **Results levels.** Keep the waystones; drop "stone n of 4" from visible text. Show and announce only the
   level name and what it means.
2. **Invented supporting content.** The alert name, deploy annotation, log lines, quiz questions and lesson
   titles in the concepts are placeholders until the SME reviews them in E4-01, E9 and E10-02.
3. **Durations.** No durations on lesson cards (no time pressure). Module and region estimates still appear
   on the overview and region pages (ROADMAP §6).
4. **Crossing timing.** 900 / 1000 / 900 ms, 2.8 s in total, within E1-06's 3 s budget.
5. **Map pins on narrow screens.** List view is the fallback, and below about 720 px it is the default.
