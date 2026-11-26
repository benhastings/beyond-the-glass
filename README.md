# Beyond the Glass

> *For years you watched the glass. Now step through it.*

A self-paced, interactive journey for operators moving from on-prem, eyes-on-glass operations into Kubernetes, GitOps and modern observability. Learners take a short placement quiz, then follow a personalized trail from ELI5 foundations to troubleshooting a failing microservice with `kubectl`, Argo CD, Grafana/Prometheus and OpenTelemetry. All hands-on practice runs in a browser simulation, so there's nothing to install.

- **The site:** <https://benhastings.github.io/beyond-the-glass/>
- **Runs on:** GitHub Pages (static; no backend), or the container image below, on your own network
- **Your progress:** saved in your browser; export/import with a progress code
- **Status:** curriculum in review before launch. See the [roadmap](docs/plan/ROADMAP.md).

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
npm run diagrams     # render lesson <Diagram>s (Mermaid) to SVG in content/diagrams/; commit the result
```

`src/sim`, `src/placement`, `src/progress` and `src/content` are framework-free: `npm run lint` fails on
any React import, any import from `src/app`, or any DOM API there.

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

## For contributors and coding agents
- Start with [`AGENTS.md`](AGENTS.md)
- Plan and epics: [`docs/plan/`](docs/plan/)
- Issues are generated from the epic files by [`scripts/create-issues.py`](scripts/create-issues.py)
