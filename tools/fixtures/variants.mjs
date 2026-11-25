// The fault variants captured from a real kind cluster (E6-11). Each runs in its own namespace as a
// one-replica Deployment named `web`, shaped like Ravenpost's. Images are small public ones; the bad
// image points at a .example registry that can never resolve.
const BUSYBOX = 'busybox:1.36'
const NGINX = 'nginx:1.27-alpine'
/** Loaded into the kind node before applying, so pulls don't race the wait. */
export const IMAGES = [BUSYBOX, NGINX]

const deployment = (container, extra = {}) => ({
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name: 'web', labels: { app: 'web' } },
  spec: {
    replicas: 1,
    selector: { matchLabels: { app: 'web' } },
    template: {
      metadata: { labels: { app: 'web' } },
      spec: { containers: [{ name: 'web', ...container }], ...extra },
    },
  },
})
const configMap = {
  apiVersion: 'v1',
  kind: 'ConfigMap',
  metadata: { name: 'web-config' },
  data: { MODE: 'calm' },
}
const service = {
  apiVersion: 'v1',
  kind: 'Service',
  metadata: { name: 'web', labels: { app: 'web' } },
  spec: { selector: { app: 'web' }, ports: [{ name: 'http', port: 80, targetPort: 80 }] },
}

export const VARIANTS = {
  healthy: [
    configMap,
    service,
    deployment({ image: NGINX, ports: [{ name: 'http', containerPort: 80 }] }),
  ],
  'bad-image': [service, deployment({ image: 'registry.example/ravenpost/web:missing' })],
  crash: [
    service,
    deployment({
      image: BUSYBOX,
      command: [
        'sh',
        '-c',
        'echo starting web; echo "fatal: cannot reach mail relay" >&2; sleep 1; exit 1',
      ],
    }),
  ],
  oom: [
    service,
    deployment({
      image: BUSYBOX,
      command: ['sh', '-c', 'echo allocating; head -c 200m /dev/zero | tail'],
      resources: { requests: { memory: '32Mi' }, limits: { memory: '48Mi' } },
    }),
  ],
  'missing-config-key': [
    configMap,
    deployment({
      image: NGINX,
      env: [
        { name: 'MISSING', valueFrom: { configMapKeyRef: { name: 'web-config', key: 'NOPE' } } },
      ],
    }),
  ],
  'bad-readiness': [
    service,
    deployment({
      image: NGINX,
      ports: [{ name: 'http', containerPort: 80 }],
      readinessProbe: {
        httpGet: { path: '/ready', port: 'http' },
        periodSeconds: 5,
        failureThreshold: 1,
      },
    }),
  ],
  'oversized-requests': [
    deployment({ image: NGINX, resources: { requests: { cpu: '64', memory: '512Gi' } } }),
  ],
}

/** What to capture for each variant, run with `-n fx-<variant>`. `{pod}` is the variant's pod. */
export const CAPTURES = {
  'get-pods': 'get pods',
  'get-pods-wide': 'get pods -o wide',
  'get-pods-yaml': 'get pod {pod} -o yaml',
  'describe-pod': 'describe pod {pod}',
  'get-deploy': 'get deploy',
  'describe-deploy': 'describe deploy web',
  'get-events': 'get events --sort-by=.lastTimestamp',
  'get-svc': 'get svc',
  'get-endpoints': 'get endpoints',
  logs: 'logs {pod}',
  'logs-previous': 'logs {pod} --previous',
}
