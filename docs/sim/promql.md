# PromQL in the simulation (E8-03)

The PromQL explorer runs real PromQL, with Prometheus' semantics, for the subset below.
`src/sim/promql/` parses and evaluates it against the simulation's telemetry (see
[`telemetry.md`](telemetry.md)), sampled every 15 seconds.

## Supported

| Feature | Examples |
|---|---|
| Instant selectors, with `=`, `!=`, `=~` and `!~`, and a 5-minute lookback | `kube_deployment_status_replicas_available{namespace="ravenpost"}`, `{__name__="up", job!~"test.*"}` |
| Range selectors and `offset` | `http_server_requests_total[5m]`, `… [10m] offset 5m` |
| `rate`, `increase`, `irate` | Prometheus' extrapolation, with counter resets handled |
| `histogram_quantile(φ, …)` | Prometheus' interpolation inside the bucket. Keep `le` in `by (…)`. |
| Aggregations: `sum`, `avg`, `max`, `min`, `count`, `topk(k, …)`, with `by (…)` or `without (…)` | `sum by (service) (rate(x[5m]))`, `topk(3, x)` |
| Arithmetic: `+ - * / % ^`, scalar and vector, one-to-one matching, `on (…)` and `ignoring (…)` | `a / ignoring(resource, unit) b` |
| Comparisons: `== != < > <= >=`, filtering or with `bool` | `x > 0.75`, `x > bool 0` |
| Set operators: `and`, `or`, `unless` | |

The explorer's 18 starter queries (`src/sim/promql/library.ts`) each have a plain-English explanation. Each
is tested against hand-computed values.

## Not supported

Anything else is refused with a message that quotes what isn't available and says what to try. For
example: `"avg_over_time" isn't available in this simulation — try rate() or increase() over a range, or
avg by (…) across series`. This covers:

- the `*_over_time` functions
- `delta`, `deriv`, `predict_linear`, `absent`, `label_replace`, the maths functions, `sort`
- `quantile`, `stddev`, `bottomk`, `count_values`
- `group_left` and `group_right`
- subqueries (`[5m:1m]`)
- the `@` modifier

Syntax errors give the position and what was expected.
