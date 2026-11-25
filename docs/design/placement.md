# Placement: the Threshold (E4-01)

The Threshold is a short, gentle questionnaire that picks each learner's starting trail. It isn't a test:
there are no scores, no timer and no wrong answers. Every scenario question offers "I'm not sure yet", and
the learner can override any placement afterwards.

- The bank is `content/threshold/bank.yaml`.
- Its schema is `src/placement/bank.ts`, validated at build time by `thresholdPlugin`.
- The engine that serves and scores it is E4-03 (`src/placement/`).

## Domains

| Domain | Covers |
|---|---|
| `foundations` | Linux command line, networking (DNS, ports), logs and process basics |
| `containers` | images, containers, registries, isolation |
| `kubernetes` | pods, Deployments, Services, troubleshooting with kubectl |
| `delivery` | Git, CI/CD pipelines, GitOps with Argo CD |
| `observability` | metrics, logs, traces, dashboards, alerts and SLOs |

## Levels

Each domain gets a level from 0 to 3:

| Level | Name | Means |
|---|---|---|
| 0 | Wayfarer | New to this |
| 1 | Deckhand | Has seen it, needs the basics |
| 2 | Navigator | Uses it, can skip the introductions |
| 3 | Pathfinder | Works with it regularly |

## Items

- **Experience** items are self-reports with four options, from "never touched it" (level 0) to "I do this
  weekly" (level 3). Each option carries its `level`.
- **Scenario** items are multiple choice with a real-world prompt ("A pod shows `CrashLoopBackOff`. What do
  you look at first?"). They have a `correct` option, and the last option is always
  `{ id: not-sure, text: I'm not sure yet }`. That answer is treated as "not yet known", never as wrong.

Every item has a `domain`, a `difficulty` from 1 to 3 and a one-sentence `why`, which the results screen
shows next to the learner's answer. Every example uses the fictional Ravenpost world or `*.example` names,
and content-guard checks this. Question stems must read at grade 9 or below, which `npm run lint:content`
checks.

The bank holds at least 25 items: at least 5 per domain, each domain with at least one experience item and
an easiest (difficulty 1) scenario. The build enforces all of this.

## Serving (12 questions)

For each domain, in the order above, serve:

1. one experience item, then
2. one or two scenario items (`serving.scenariosPerDomain`), starting from difficulty 1 and going up.

That's 5 experience items and 7 scenario items, 12 in all (`serving.total`). Domains where the learner
reports more experience get the second, harder scenario.

**Adaptive skip:** if the experience answer is level 0 ("never"), serve only the easiest scenario for that
domain. Someone new to containers isn't asked three questions about them.

## Scoring

For each domain:

- The **self-report level** is the level of the experience option chosen.
- The **scenario level** counts correct scenario answers, weighted by difficulty:
  - none correct (or only "not sure"): 0
  - the difficulty-1 item correct: 1
  - a difficulty-2 item correct: 2
  - a difficulty-3 item correct: 3
- **When the two disagree, use the lower level**, and flag the domain "confirm in module check". The first
  module check in that domain can then raise the level.

The lower level is the safer default. Starting a little too early costs a few minutes of review; starting
too late leaves gaps.

## From levels to modules

Each lesson has a `level` (front matter). A module's level is the lowest level of its lessons. For each
module in the learner's path:

| Learner's level vs the module's level | Status |
|---|---|
| learner < module | **recommended** |
| learner = module | **review**: worth a quick pass |
| learner > module | **test-out available**: a module check can mark it done |

The starting module is the first **recommended** module in journey order. Each region's default depth layer
follows the learner's level in its domain: ELI5 for Wayfarer, Operator for Deckhand and Navigator, and Deep
dive for Pathfinder (E5-05).

The learner can override any domain's level from the results screen or from Settings. Overrides always win.

## Framing copy

`intro` in the bank holds:

- **title**: "The Threshold"
- **body**: "There are no wrong answers. This picks your starting trail, and you can change it at any time."
- **time**: "About 5 minutes, 12 questions."
- **privacy**: "Your answers stay in this browser. Nothing is sent anywhere."

A "Skip the Threshold and start from the very beginning" option sets every domain to Wayfarer (E4-02).

## Review

A subject-matter expert reviews every scenario item for accuracy before it ships (E4-01.AC2). They check
that the correct answer is what an experienced operator would actually do first, and that the `why`
sentence is true.
