/**
 * The shipped dashboards (E8-02), as data: what each panel asks Prometheus, how to show it, and when a
 * value is worth worrying about. `$service` and `$namespace` are replaced by the variables' values
 * (a regex; "All" is `.*`).
 */
export type PanelType = 'timeseries' | 'stat' | 'gauge' | 'table' | 'logs'
export type PanelUnit = 'none' | 'bytes' | 'seconds' | 'percent' | 'rps'

export interface Threshold {
  value: number
  status: 'warn' | 'alert'
  label: string
}

export interface Panel {
  id: string
  title: string
  type: PanelType
  /** PromQL (logs panels: the namespace whose logs to show). */
  query: string
  unit: PanelUnit
  /** What the panel tells you, shown on hover and read by screen readers. */
  description: string
  thresholds?: Threshold[]
  /** For gauges: the value that fills it. */
  max?: number
  /** Columns in a 12-column grid. */
  width: 3 | 4 | 6 | 8 | 12
  /** Show Argo CD deploys on this panel's time axis. */
  deploys?: boolean
}

export interface Variable {
  name: 'service' | 'namespace'
  label: string
  /** The metric and label whose values it offers. */
  from: { metric: string; label: string }
}

export interface Dashboard {
  id: string
  title: string
  description: string
  variables: Variable[]
  panels: Panel[]
}

const SERVICE: Variable = {
  name: 'service',
  label: 'Service',
  from: { metric: 'http_server_requests_total', label: 'service' },
}
const NAMESPACE: Variable = {
  name: 'namespace',
  label: 'Namespace',
  from: { metric: 'kube_deployment_status_replicas_available', label: 'namespace' },
}
const ERR = (filter: string, range = '5m') =>
  `sum by (service) (rate(http_server_requests_total{${filter}http_response_status_code=~"5.."}[${range}])) / sum by (service) (rate(http_server_requests_total{${filter.replace(/,\s*$/, '')}}[${range}]))`

export const DASHBOARDS: readonly Dashboard[] = [
  {
    id: 'service-overview',
    title: 'Service Overview (RED)',
    description:
      'Rate, errors and duration for each service: the first place to look when something feels slow or broken.',
    variables: [SERVICE],
    panels: [
      {
        id: 'error-ratio-now',
        title: 'Error ratio now',
        type: 'stat',
        query: `sum(rate(http_server_requests_total{service=~"$service", http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_requests_total{service=~"$service"}[5m]))`,
        unit: 'percent',
        description:
          'Share of requests failing over the last 5 minutes, across the selected services.',
        thresholds: [
          { value: 0.01, status: 'warn', label: 'above 1%' },
          { value: 0.05, status: 'alert', label: 'above 5%' },
        ],
        width: 4,
      },
      {
        id: 'p99-now',
        title: 'p99 latency now',
        type: 'stat',
        query: `histogram_quantile(0.99, sum by (le) (rate(http_server_request_duration_seconds_bucket{service=~"$service"}[5m])))`,
        unit: 'seconds',
        description:
          '99% of requests to the selected services finished faster than this, over the last 5 minutes.',
        thresholds: [
          { value: 0.5, status: 'warn', label: 'above 500 ms' },
          { value: 2, status: 'alert', label: 'above 2 s' },
        ],
        width: 4,
      },
      {
        id: 'rate-now',
        title: 'Requests per second now',
        type: 'stat',
        query: `sum(rate(http_server_requests_total{service=~"$service"}[5m]))`,
        unit: 'rps',
        description: 'Requests per second to the selected services.',
        width: 4,
      },
      {
        id: 'request-rate',
        title: 'Requests per second',
        type: 'timeseries',
        query: `sum by (service) (rate(http_server_requests_total{service=~"$service"}[5m]))`,
        unit: 'rps',
        description:
          'Traffic per service. A drop can mean users can’t reach it; a rise can mean retries.',
        width: 6,
        deploys: true,
      },
      {
        id: 'error-ratio',
        title: 'Error ratio',
        type: 'timeseries',
        query: ERR('service=~"$service", '),
        unit: 'percent',
        description: 'Share of each service’s requests that fail (5xx).',
        thresholds: [{ value: 0.05, status: 'alert', label: '5%' }],
        width: 6,
        deploys: true,
      },
      {
        id: 'p99-latency',
        title: 'p99 latency',
        type: 'timeseries',
        query: `histogram_quantile(0.99, sum by (service, le) (rate(http_server_request_duration_seconds_bucket{service=~"$service"}[5m])))`,
        unit: 'seconds',
        description:
          'The slowest 1% of requests, per service. Latency travels up the call chain: compare callers with what they call.',
        thresholds: [{ value: 0.5, status: 'warn', label: '500 ms' }],
        width: 6,
        deploys: true,
      },
      {
        id: 'requests-by-status',
        title: 'Requests in the last hour, by status',
        type: 'table',
        query: `sum by (service, http_response_status_code) (increase(http_server_requests_total{service=~"$service"}[1h]))`,
        unit: 'none',
        description:
          'How many requests each service answered with each status code over the last hour.',
        width: 6,
      },
    ],
  },
  {
    id: 'kubernetes-workloads',
    title: 'Kubernetes Workloads',
    description:
      'Replicas, restarts and memory for the pods in a namespace, with their recent logs.',
    variables: [NAMESPACE],
    panels: [
      {
        id: 'memory-headroom',
        title: 'Closest to its memory limit',
        type: 'gauge',
        query: `max(container_memory_working_set_bytes{namespace=~"$namespace"} / ignoring(resource, unit) kube_pod_container_resource_limits{namespace=~"$namespace"})`,
        unit: 'percent',
        max: 1,
        description:
          'The container using the largest share of its memory limit. At 100% the kernel kills it (OOMKilled).',
        thresholds: [
          { value: 0.8, status: 'warn', label: 'above 80%' },
          { value: 0.95, status: 'alert', label: 'above 95%' },
        ],
        width: 4,
      },
      {
        id: 'unavailable',
        title: 'Deployments with nothing available',
        type: 'stat',
        query: `count(kube_deployment_status_replicas_available{namespace=~"$namespace"} == 0)`,
        unit: 'none',
        description: 'Deployments that can’t serve any requests right now.',
        thresholds: [{ value: 1, status: 'alert', label: 'one or more' }],
        width: 4,
      },
      {
        id: 'restarts-total',
        title: 'Restarts in the last hour',
        type: 'stat',
        query: `sum(increase(kube_pod_container_status_restarts_total{namespace=~"$namespace"}[1h]))`,
        unit: 'none',
        description: 'Container restarts across the namespace over the last hour.',
        thresholds: [{ value: 1, status: 'warn', label: 'one or more' }],
        width: 4,
      },
      {
        id: 'available',
        title: 'Available replicas',
        type: 'timeseries',
        query: `sum by (deployment) (kube_deployment_status_replicas_available{namespace=~"$namespace"})`,
        unit: 'none',
        description: 'Replicas ready to serve, per Deployment.',
        width: 6,
        deploys: true,
      },
      {
        id: 'memory',
        title: 'Memory by pod',
        type: 'timeseries',
        query: `sum by (pod) (container_memory_working_set_bytes{namespace=~"$namespace"})`,
        unit: 'bytes',
        description: 'Working-set memory per pod (the peak in each scrape).',
        width: 6,
      },
      {
        id: 'restarts',
        title: 'Restarts by container (last hour)',
        type: 'table',
        query: `increase(kube_pod_container_status_restarts_total{namespace=~"$namespace"}[1h]) > 0`,
        unit: 'none',
        description:
          'Containers that restarted in the last hour. Check their previous logs: kubectl logs --previous.',
        width: 6,
      },
      {
        id: 'logs',
        title: 'Recent error logs',
        type: 'logs',
        query: '$namespace',
        unit: 'none',
        description: 'The newest error lines from the namespace’s containers.',
        width: 6,
      },
    ],
  },
  {
    id: 'ravenpost-slo',
    title: 'Ravenpost SLO',
    description:
      'Whether the gate is meeting its objectives: 99.9% of requests succeed, and 95% finish within 500 ms.',
    variables: [],
    panels: [
      {
        id: 'availability',
        title: 'Availability (last hour)',
        type: 'stat',
        query: `1 - (sum(rate(http_server_requests_total{service="gate", http_response_status_code=~"5.."}[1h])) / sum(rate(http_server_requests_total{service="gate"}[1h])))`,
        unit: 'percent',
        description: 'Share of the gate’s requests that succeeded. The objective is 99.9%.',
        thresholds: [{ value: 0.999, status: 'alert', label: 'below 99.9%' }],
        width: 6,
      },
      {
        id: 'fast-enough',
        title: 'Requests within 500 ms (last hour)',
        type: 'stat',
        query: `sum(rate(http_server_request_duration_seconds_bucket{service="gate", le="0.5"}[1h])) / sum(rate(http_server_request_duration_seconds_count{service="gate"}[1h]))`,
        unit: 'percent',
        description:
          'Share of the gate’s requests that finished within 500 ms. The objective is 95%.',
        thresholds: [{ value: 0.95, status: 'alert', label: 'below 95%' }],
        width: 6,
      },
      {
        id: 'gate-errors',
        title: 'Gate error ratio',
        type: 'timeseries',
        query: ERR('service="gate", '),
        unit: 'percent',
        description: 'The gate’s failing share over time, against the 0.1% the objective allows.',
        thresholds: [{ value: 0.001, status: 'alert', label: 'objective 0.1%' }],
        width: 12,
        deploys: true,
      },
      {
        id: 'gate-p95',
        title: 'Gate p95 latency',
        type: 'timeseries',
        query: `histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket{service="gate"}[5m])))`,
        unit: 'seconds',
        description:
          '95% of the gate’s requests finished faster than this; the objective is 500 ms.',
        thresholds: [{ value: 0.5, status: 'alert', label: 'objective 500 ms' }],
        width: 12,
        deploys: true,
      },
    ],
  },
]

/** Threshold semantics: for availability-style objectives, lower is worse. */
export const lowerIsWorse = (p: Panel) =>
  p.thresholds?.some((t) => t.label.startsWith('below')) ?? false
