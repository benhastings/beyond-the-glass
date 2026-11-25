/**
 * Starter queries (E8-03): what on-call engineers ask Prometheus first, each with a plain-English reading.
 * The PromQL explorer lists them, and the field-card cheat sheet (E2-07) shares them.
 */
export interface StarterQuery {
  id: string
  title: string
  query: string
  explanation: string
}

export const STARTER_QUERIES: readonly StarterQuery[] = [
  {
    id: 'request-rate',
    title: 'Requests per second, per service',
    query: 'sum by (service) (rate(http_server_requests_total[5m]))',
    explanation:
      'rate() turns each request counter into requests per second over the last 5 minutes; sum by (service) adds up the status codes, one line per service.',
  },
  {
    id: 'error-ratio',
    title: 'Share of requests that fail',
    query:
      'sum by (service) (rate(http_server_requests_total{http_response_status_code=~"5.."}[5m])) / sum by (service) (rate(http_server_requests_total[5m]))',
    explanation: 'Failed requests (any 5xx status) divided by all requests: 0.05 means 5% fail.',
  },
  {
    id: 'gate-errors',
    title: 'Failed requests per second at the gate',
    query:
      'sum(rate(http_server_requests_total{service="gate", http_response_status_code!="200"}[5m]))',
    explanation:
      'Only the gate, only statuses other than 200: how many requests a second users see fail.',
  },
  {
    id: 'p99-latency',
    title: 'p99 latency (seconds)',
    query:
      'histogram_quantile(0.99, sum by (service, le) (rate(http_server_request_duration_seconds_bucket[5m])))',
    explanation:
      '99% of requests finished faster than this. Keep le in the by (…) list: histogram_quantile() needs the buckets.',
  },
  {
    id: 'p50-latency',
    title: 'Median latency (seconds)',
    query:
      'histogram_quantile(0.5, sum by (service, le) (rate(http_server_request_duration_seconds_bucket[5m])))',
    explanation: 'Half the requests finished faster than this: the typical request.',
  },
  {
    id: 'p90-latency',
    title: 'p90 latency (seconds)',
    query:
      'histogram_quantile(0.9, sum by (service, le) (rate(http_server_request_duration_seconds_bucket[5m])))',
    explanation: '90% of requests finished faster than this.',
  },
  {
    id: 'mean-latency',
    title: 'Average latency (seconds)',
    query:
      'sum by (service) (rate(http_server_request_duration_seconds_sum[5m])) / sum by (service) (rate(http_server_request_duration_seconds_count[5m]))',
    explanation:
      'Total time spent on requests divided by how many there were. Averages hide slow outliers; compare with p99.',
  },
  {
    id: 'restarts',
    title: 'Containers that restarted in the last hour',
    query: 'increase(kube_pod_container_status_restarts_total[1h]) > 0',
    explanation:
      'increase() counts restarts over the hour; > 0 keeps only the containers that restarted.',
  },
  {
    id: 'restarts-earlier',
    title: 'Restarts between 5 and 15 minutes ago',
    query: 'increase(kube_pod_container_status_restarts_total[10m] offset 5m)',
    explanation:
      'offset 5m shifts the 10-minute window back by 5 minutes: useful to see what happened shortly before now.',
  },
  {
    id: 'top-memory',
    title: 'Three containers using the most memory',
    query: 'topk(3, container_memory_working_set_bytes)',
    explanation: 'topk(3, …) keeps the three biggest values, in bytes.',
  },
  {
    id: 'memory-vs-limit',
    title: 'Memory use as a share of the limit',
    query:
      'container_memory_working_set_bytes / ignoring(resource, unit) kube_pod_container_resource_limits',
    explanation:
      'Use divided by limit: 1 means at the limit, where the kernel kills the container (OOMKilled). ignoring(resource, unit) matches the two metrics despite the limit’s extra labels.',
  },
  {
    id: 'memory-near-limit',
    title: 'Containers above 75% of their memory limit',
    query:
      'container_memory_working_set_bytes / ignoring(resource, unit) kube_pod_container_resource_limits > 0.75',
    explanation: 'The same ratio, keeping only containers close to being OOMKilled.',
  },
  {
    id: 'nothing-available',
    title: 'Deployments with no replica available',
    query: 'kube_deployment_status_replicas_available == 0',
    explanation:
      'A comparison keeps only the series that match: here, Deployments that can’t serve anything.',
  },
  {
    id: 'replicas-by-namespace',
    title: 'Available replicas per namespace',
    query: 'sum by (namespace) (kube_deployment_status_replicas_available)',
    explanation: 'Adds up the available replicas of every Deployment in each namespace.',
  },
  {
    id: 'instant-rate',
    title: 'The api’s request rate right now',
    query: 'irate(http_server_requests_total{service="api", http_response_status_code="200"}[1m])',
    explanation:
      'irate() uses only the last two samples: quick to react, but noisy. rate() smooths over the whole range.',
  },
  {
    id: 'containers-per-namespace',
    title: 'Running containers per namespace',
    query: 'count by (namespace) (container_memory_working_set_bytes)',
    explanation: 'count by (…) counts series: one memory series per running container.',
  },
  {
    id: 'max-memory',
    title: 'The most memory any container uses, per namespace',
    query: 'max by (namespace) (container_memory_working_set_bytes)',
    explanation: 'max by (…) keeps the largest value in each group.',
  },
  {
    id: 'fewest-available',
    title: 'Fewest available replicas of any Deployment',
    query: 'min without (deployment) (kube_deployment_status_replicas_available)',
    explanation:
      'without (deployment) groups by every other label, so this is the smallest value across Deployments: 0 means at least one is down.',
  },
]
