# syntax=docker/dockerfile:1
# Beyond the Glass: the same static build as GitHub Pages, served by unprivileged nginx (E0-09).

# The build output is platform-independent static files, so build once on the builder's own platform;
# a multi-arch build only repeats the small runtime stage.
FROM --platform=$BUILDPLATFORM node:26.13.1-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The container doesn't need the Pages 404 redirect: nginx redirects path-style links itself.
RUN npm run build && rm dist/404.html

FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim@sha256:a8cb0f33d51fa107c96fd2bd3a71aaf564ec131e9d2bdf8700944f0ed8b170d7
ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="Beyond the Glass" \
      org.opencontainers.image.description="Self-paced journey from eyes-on-glass operations to Kubernetes, GitOps and observability" \
      org.opencontainers.image.source="https://github.com/benhastings/beyond-the-glass" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}"

# Apply Alpine's security fixes now rather than waiting for the base image to be rebuilt (Trivy gates
# on fixable HIGH/CRITICAL findings, E0-09.AC6). This makes the runtime layer depend on the build date;
# the digest-pinned base keeps everything else fixed.
USER root
RUN apk upgrade --no-cache
USER 101:101

COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
# Run nginx directly: no entrypoint scripts (they need a shell and write to /etc/nginx), so the root
# filesystem can be read-only.
ENTRYPOINT ["nginx", "-g", "daemon off;"]
CMD []
