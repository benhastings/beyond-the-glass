# Design direction

**Approved direction (2026-11-16):** the Fable concept set, chosen by Ben over an alternative set.

- Live canvas: https://claude.ai/artifact/LvMTEYxVMezQpWcbPex9tJ
- Source of the seven concept screens: [`concepts/approved/`](concepts/approved/). These are reference mockups, not app code; they load fonts from Google, which the app must not do.
- Brief they were built from: [`visual-brief.md`](visual-brief.md)

[`art-direction.md`](art-direction.md) turns these concepts into a written spec and design tokens (E1-01). Where the concepts and the brief disagree, the brief's rules (accessibility, original IP, tone) win.

## What was approved

| Aspect | Decision |
|---|---|
| Display type | Bricolage Grotesque |
| Body type | Atkinson Hyperlegible Next (designed for low-vision readers) |
| Mono (terminal, queries, labels) | Atkinson Hyperlegible Mono |
| Illustration | Flat, layered cut-paper SVG. No people, faces, logos or franchise props. |
| Motifs | Ripple rings (the glass); waystones (levels and progress) |

All three typefaces are open-licensed; the app self-hosts them.

**Three moods:**

| Mood | Used for | Ground | Ink | Accents |
|---|---|---|---|---|
| Console Room | Overview, quiz, results | Near-black blue-grey `#12151A` | `#D3D8DE` | Beige CRT plastic `#EFE9DC`; amber `#FFB84D` and green `#6FE0A0` phosphor. Aqua `#7DE8D8` is the only "living" colour, used only where the glass glows. |
| The Reach | Map and lessons | Pale mist green `#E3F9F4` / white | Deep lagoon teal `#10272C` | Teal `#0A5A61`; sun-gold `#FFB84D` / `#FFF3C9`. Each region has its own accent (brass Chartroom, violet-stone Helm Keep, …). |
| Stormwatch | Capstone war room | Indigo night `#0E1220` | `#E8EBF5` | Panels `#39405C`; lightning yellow `#FFD35C` for focus and objectives; coral `#FFA07A` for alerts, always with an icon and words. |

Measured spot-checks: muted greys are used only as borders, and they meet the 3:1 non-text minimum (`#6B7686` on `#12151A` = 3.97:1; `#6A7396` on `#0E1220` = 4.0:1; `#6F8A8C` on white = 3.69:1). E1-01 must measure every token pair.

## Review points (settled in E1-01)
All five were decided as recommended on 2026-11-24; see [art-direction.md](art-direction.md#review-points-settled).

1. **Results levels.** Keep the waystones but drop "n of 4" from the visible text; announce only the level name and its meaning.
2. **Invented supporting content.** Alert name, deploy annotation, log lines, quiz questions and lesson titles in the concepts are placeholders until the SME reviews them in E4-01, E9 and E10-02.
3. **Lesson durations** are left off lesson cards. Module and region estimates still appear on the overview and region pages.
4. **Crossing timing:** 900 / 1000 / 900 ms (2.8 s total), within the ≤ 3 s budget in E1-06.
5. **Map pins:** list view is the fallback, and below ~720 px it is the default.

The written spec and tokens are in [art-direction.md](art-direction.md).
