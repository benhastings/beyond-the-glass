# Beyond the Glass

> *For years you watched the glass. Now step through it.*

## Why this exists

For a long time, operations meant watching: a wall of status lights, a pager, a runbook and a change ticket.
The people who did that work built real instincts. They know what "normal" looks like at 3 a.m., they notice
the small thing before it becomes the big thing, and they stay calm when everything is red.

The systems changed underneath them. Services now run as containers on Kubernetes, ship through pipelines,
are deployed by Git rather than by hand, and report through metrics, logs and traces instead of a single green
light. Most training for that world is written for developers or for certification exams. It assumes
vocabulary these operators were never given, and the usual place to practise is production, where mistakes
are expensive and nobody wants to learn in front of an incident.

Beyond the Glass is built on a simple belief: **experienced operators don't need to start over; they need
a bridge.** Their instincts transfer. What they need is a map from what they already know (servers, init
scripts, Nagios checks, `tail -f`, change tickets) to the cloud-native equivalent, and a safe place to build
new habits until they're confident troubleshooting a real failing service.

## How it works

- **Start where you are.** A short placement quiz, the *Threshold*, sets a personal trail. It's framed as
  choosing a starting point, not a test: there's always an "I'm not sure yet" answer, no score, and you can
  change where you begin.
- **Learn by bridging, not replacing.** Every concept comes in three depths: ELI5 (an analogy, no jargon),
  Operator (what you type and what you'll see) and Deep dive (how it really works). A *Rosetta Stone* maps
  old-world terms to new ones.
- **Practise safely.** Every hands-on exercise runs against a simulation in the browser: `kubectl`, `argocd`,
  GitLab pipelines, an Argo CD console, Grafana-style dashboards, PromQL, logs and traces, all driven by one
  consistent incident timeline. There's no cluster, install or credential, and nothing you do can break
  anything real.
- **Build the right habits.** Check your context, gather evidence before acting, change things through Git
  rather than by hand, and follow a problem from metrics to traces to logs.
- **Respect the learner.** WCAG 2.2 AA, keyboard-first, reduced-motion aware, no timers and no leaderboard.

## What's inside

The journey begins in **the Console Room**, a dim 1990s operations room. One monitor starts to ripple, the
learner steps through the glass, and arrives in **the Reach**, a world where each region teaches one layer
of the stack:

| Region | What you learn |
|---|---|
| **Console Room** | The journey, the Threshold, and *From the NOC to the Cluster*: how your experience maps across |
| **The Harbor** | Containers and images: tags, digests, registries, and why images don't change |
| **Helm Keep** | Kubernetes fundamentals: pods, namespaces, Deployments, Services, config and resources |
| **The Chartroom** | `kubectl` fluency and safe habits, then the triage flow and common failure states |
| **Mirror Lake** | From commit to image with GitLab CI, then Argo CD and GitOps discipline: sync, drift and rollback |
| **Signalwood** | Metrics with Prometheus and Grafana, OpenTelemetry traces and logs, and alerts, SLOs and the first five minutes |
| **Stormwatch** | The capstone, *The Long Night*: a multi-act incident on the fictional Ravenpost system, worked in a war room and closed with a debrief |

Progress is saved in your browser and can move between browsers, or go to a lead, as a progress code.

- **The site:** <https://benhastings.github.io/beyond-the-glass/>
- **Runs on:** GitHub Pages (static, no backend), or the container image below on your own network
- **Status:** the curriculum and capstone are complete; a team pilot comes before the v1.0 release. See the
  [roadmap](docs/plan/ROADMAP.md).

## Privacy

Beyond the Glass has no server, no accounts and no analytics. It makes no requests to anything but the site
it's served from: fonts and assets are self-hosted. Your progress stays in your browser's storage. It leaves
only when you export a progress code and give it to someone (a lead, say), and a code holds your progress and
settings, never your name. The lead view reads codes in the browser and stores nothing.

## For leads and maintainers

- [Facilitator guide](docs/facilitator-guide.md): rolling it out to a team, the lead view, and a tabletop
  exercise with the capstone.
- [Maintainer guide](docs/maintainer-guide.md): adding a lesson, a scenario or a kubectl command,
  regenerating fixtures, and releasing.

## For contributors and coding agents
- Start with [`AGENTS.md`](AGENTS.md)
- Plan and epics: [`docs/plan/`](docs/plan/)
- Issues are generated from the epic files by [`scripts/create-issues.py`](scripts/create-issues.py)

## Self-hosting with the container image

The same build that GitHub Pages serves also ships as a small container image: unprivileged nginx on port
8080, a non-root user (UID 101), a read-only root filesystem, strict security headers and `GET /healthz`.
Use it on a laptop, an internal cluster, or an air-gapped network. Releases are published for
`linux/amd64` and `linux/arm64` with SBOM and provenance attestations.

### Run it

```bash
docker run --rm -p 8080:8080 \
  --read-only --tmpfs /tmp:rw,size=16m --cap-drop=ALL --security-opt=no-new-privileges \
  ghcr.io/benhastings/beyond-the-glass:latest
# open http://localhost:8080/
```

To build it yourself: `docker build -t btg . && docker run --rm -p 8080:8080 btg`.

### Docker Compose

```bash
docker compose -f deploy/compose.yaml up
```

### Kubernetes

```bash
kubectl apply -k deploy/k8s
kubectl port-forward service/beyond-the-glass 8080:80
```

`deploy/k8s` has a Deployment (two replicas, probes on `/healthz`, resource requests and limits, a restricted
security context and an in-memory `/tmp`) and a Service. Pin a release instead of `latest` with an overlay or
`kustomize edit set image ghcr.io/benhastings/beyond-the-glass=ghcr.io/benhastings/beyond-the-glass:<version>`.

### Air-gapped networks

On a machine with internet access, save the image to a file; carry the file across; load it on the other side:

```bash
docker pull ghcr.io/benhastings/beyond-the-glass:<version>
docker save ghcr.io/benhastings/beyond-the-glass:<version> | gzip > beyond-the-glass.tar.gz
# ...move the file...
gunzip -c beyond-the-glass.tar.gz | docker load
# then push it to the internal registry, or run it directly
```

The app makes no requests to any other origin, so it works with no outbound network at all.

## Getting started

Requires Node 26 (see `.nvmrc`; `nvm use` picks it up).

```bash
npm ci               # install exactly what package-lock.json pins
npm run dev          # dev server with hot reload
npm run build        # production build into dist/
npm run preview      # serve dist/ locally
npm run typecheck    # TypeScript in strict mode, no emit
npm run lint         # ESLint (typescript-eslint strict, react-hooks, jsx-a11y); fails on any warning
npm run lint:content # content style lint: banned words, ELI5 reading level, objectives, alt text, step length
npm run format       # rewrite files with Prettier
npm run format:check # fail if any file isn't Prettier-formatted
npm test             # Vitest: unit (Node), dom (jsdom + Testing Library) and repo projects
npm run test:coverage # the same with v8 coverage; fails below 90% lines in src/sim, src/placement, src/progress or 70% overall
npm run test:e2e     # Playwright in Chromium against vite preview, with axe
npm run diagrams     # render Mermaid diagrams (lessons, docs/sim) to SVG; commit the result
npm run capstone-doc # write docs/sim/the-long-night.md from the capstone scenario
```

`src/sim`, `src/placement`, `src/progress` and `src/content` are framework-free: `npm run lint` fails on
any React import, any import from `src/app`, or any DOM API there.
