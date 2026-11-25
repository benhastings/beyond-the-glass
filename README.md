# Beyond the Glass

> *For years you watched the glass. Now step through it.*

A self-paced, interactive journey for operators moving from on-prem, eyes-on-glass operations into Kubernetes, GitOps and modern observability. Learners take a short placement quiz, then follow a personalized trail from ELI5 foundations to troubleshooting a failing microservice with `kubectl`, Argo CD, Grafana/Prometheus and OpenTelemetry. All hands-on practice runs in a browser simulation, so there's nothing to install.

- **Runs on:** GitHub Pages (static; no backend)
- **Your progress:** saved in your browser; export/import with a progress code
- **Status:** planning. See the [roadmap](docs/plan/ROADMAP.md).

## Getting started

Requires Node 26 (see `.nvmrc`; `nvm use` picks it up).

```bash
npm ci               # install exactly what package-lock.json pins
npm run dev          # dev server with hot reload
npm run build        # production build into dist/
npm run preview      # serve dist/ locally
npm run typecheck    # TypeScript in strict mode, no emit
npm run lint         # ESLint (typescript-eslint strict, react-hooks, jsx-a11y); fails on any warning
npm run format       # rewrite files with Prettier
npm run format:check # fail if any file isn't Prettier-formatted
npm test             # Vitest: unit (Node), dom (jsdom + Testing Library) and repo projects
npm run test:coverage # the same with v8 coverage; fails below 90% lines in src/sim, src/placement, src/progress or 70% overall
npm run test:e2e     # Playwright in Chromium against vite preview, with axe
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
