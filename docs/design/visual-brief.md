# Visual brief — Beyond the Glass

A designer-facing brief for the app's look and its seven key screens. It is the input to **E1-01 (art direction)**. Any designer, human or model, should be able to work from this file alone.

## The product in one paragraph
Beyond the Glass is a self-paced web app that takes operations staff who came up through 1990s-era, on-prem "eyes-on-glass" console monitoring and gets them troubleshooting a failing microservice with `kubectl`, Argo CD, Grafana, Prometheus, Tempo, Loki and OpenTelemetry. It runs entirely in the browser (static hosting), all hands-on practice happens in a simulation, and progress is saved locally.

## The audience
Experienced operators: 15–25 years in, calm under pressure, used to watching walls of screens and working tickets, mostly on-prem Windows/Unix. Some feel left behind by containers and GitOps. The design must feel **respectful and welcoming, never childish or condescending**, and never like an exam.

## The feeling
Children stepping out of a dusty spare room into an enchanted forest: a moment of wonder when the familiar gives way to a bright, living world. Here, the learner starts in **the Console Room**, a dim ops room around 1998 (CRT monitors, beige towers, a pager, a wall of status lights, a coffee mug). After a short placement quiz, one monitor ("the glass") ripples like water, and they **step through it into the Reach**, a luminous landscape whose regions each embody one part of the curriculum.

**Hard rule:** the world is entirely original. Use no names, characters, creatures, places or iconic props from Narnia or any other franchise (no lamp-post, lion, wardrobe, witch, fauns, etc.). Draw no people or faces. Use no product logos (Kubernetes, Argo, GitLab, Grafana and so on); mock tool UIs should *evoke* familiar layouts, not copy them.

## Regions of the Reach (in order)
| Region | Metaphor | Teaches |
|---|---|---|
| Console Room | Where you came from | Overview, placement quiz, the mindset shift |
| The Harbor | Shipping containers, docks, warehouses | Containers, images, registries |
| Helm Keep | A keep whose stewards constantly restore order (*Kubernetes* is Greek for "helmsman") | Pods, deployments, services, reconciliation |
| The Chartroom | Navigators reading instruments | `kubectl` and the triage flow |
| Mirror Lake | Reflection = desired state, shore = live state, ripples = drift | GitLab CI, Argo CD, GitOps |
| Signalwood | A forest that speaks in signals | Metrics, traces, logs (Prometheus, Grafana, Tempo, Loki, OTel) |
| Stormwatch | A watchtower on a storm night | Capstone: *The Long Night*, a multi-failure incident on a fictional service called **Ravenpost** |

## The seven screens to design
1. **Console Room: journey overview (first view).** A hook headline, an illustration of the console room with the glowing middle monitor, the 7 places of the journey, "By the end you'll be able to…" (5 concrete capabilities), a privacy note (progress stays in the browser), and the primary action *Step up to the Threshold* (the quiz). A returning learner would see *Continue* instead.
2. **The Threshold: placement quiz.** One question per screen, "Question 4 of 12" progress, a domain tag, a scenario question with radio options that always include "I'm not sure yet", Back/Next, and reassurance that there are no wrong answers. No timer, no score.
3. **Your trail: results.** A headline like "Your trail begins at the Harbor". Show five domains (Foundations, Containers, Kubernetes, Delivery, Observability), each at a level from Wayfarer → Deckhand → Navigator → Pathfinder. Don't use a radar chart, and every visual needs a text equivalent. Include "why we suggested this", the first three recommended lessons, *Step through the glass*, *Change my starting point* and *Start from the very beginning*.
4. **The Crossing: storyboard.** Three frames of the ≤ 3-second transition (push in → ripple → arrival), with timing, the skip control, and the reduced-motion alternative (a 400 ms crossfade).
5. **The Reach: journey map.** An illustrated map of the regions joined by a trail. Each region shows its status as icon + text (complete / in progress / not started), and nothing is ever locked. Include a Map/List toggle with the same data in both, a "Recommended next" card with Continue, and a light progress summary.
6. **A Chartroom lesson with the simulated terminal.** A step list, the lesson title, depth tabs (ELI5 / Operator / Deep dive), a "Then → Now" analogy (`tail -f /var/log/messages` → `kubectl logs --previous`), and a terminal showing the sample output below. Include an objectives checklist, a root-cause answer field, and a progressive hint ladder (nudge → pointer → exact command).
7. **Stormwatch war room: capstone.** Act 3 of 4, "The slow creep", with a firing latency alert. Panes:
   - A Grafana-style dashboard: p99 latency rising after a deploy annotation, with exemplar markers
   - A Tempo trace waterfall showing an N+1 query pattern (42 sequential `SELECT recipients` spans under one `ledger` call)
   - A Loki log pane linked by `trace_id`
   - A small terminal showing `scribe` OOMKilled
   - An Argo CD sync/health summary
   - Act objectives
   - A context indicator that marks `prod` as a warning

## Sample data (use as-is; it must look real)
```
stage ▸ ravenpost $ kubectl get pods
NAME                            READY   STATUS             RESTARTS      AGE
gate-6d9f7c8b5-4xkzp            1/1     Running            0             2d4h
ledger-5b8c9d7f6-q2wrt          1/1     Running            0             2d4h
ravenpost-api-7c9f8d6b4-h7tnm   0/1     CrashLoopBackOff   5 (38s ago)   4m12s
scribe-84f6c7d9b-m5jlp          1/1     Running            1 (2h ago)    2d4h

stage ▸ ravenpost $ kubectl logs ravenpost-api-7c9f8d6b4-h7tnm --previous
{"level":"info","msg":"starting ravenpost-api","version":"1.14.2"}
{"level":"info","msg":"connecting to ledger","host":"ledger.ravenpost.svc"}
{"level":"error","msg":"missing required config key","key":"LEDGER_POOL_SIZE"}
```
War room:
- Trace `4bf92f35…`: `gate · GET /send` 2.41 s → `ravenpost-api · POST /messages` 2.38 s → `ledger · getRecipients` 2.21 s → 42 × `postgres · SELECT recipients` (~50 ms each) → `scribe · enqueue` 12 ms
- TraceQL: `{ resource.service.name = "ravenpost-api" && duration > 1s }`
- LogQL: `{app="ledger"} | json | trace_id="4bf92f35…"`
- Error rate 0.4% (down from 31%)
- scribe memory 97% of limit, 2 restarts in 20 min, queue 18.2k

## Accessibility (non-negotiable, WCAG 2.2 AA)
- Text contrast ≥ 4.5:1, including small grey labels; UI boundaries ≥ 3:1
- Status is never conveyed by color alone
- Real `<button>`, `<a href>`, `<input>` + `<label>` elements, even in mockups. Touch targets ≥ 44 px, and a visible focus style.
- Every chart, map or illustration has a text equivalent
- Body type tuned for legibility (consider a typeface designed for low-vision readers); monospace for terminal output
- Animation respects reduced motion; nothing flashes more than 3 times per second
- Fonts must be self-hostable (open license) for the real app

## Tone of copy
Warm, plain and direct. Never "simply", "just", "obviously" or "easy". No scores, no countdowns. The learner can always change their path.
