import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { collectorConfig, effect, HEALTHY, NODES, type PipelineConfig } from '@/sim/otel/pipeline'
import { Checkbox } from '../../ui/Checkbox'
import { CodeBlock } from '../../ui/CodeBlock'
import { RadioGroup } from '../../ui/RadioGroup'
import { cx, focusRing } from '../../ui/styles'

/**
 * `<OtelPipeline />` (E8-06): how telemetry gets from an app to the stores you query, as a diagram you can
 * walk with the arrow keys (each step says what it does), four switches that break it the ways teams do,
 * what reaches the trace store as a result, and the Collector config that would do it.
 */
export default function OtelPipeline() {
  const id = useId()
  const [config, setConfig] = useState<PipelineConfig>(HEALTHY)
  const [node, setNode] = useState(0)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const fx = effect(config)
  const yaml = collectorConfig(config)
  const set = (patch: Partial<PipelineConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
  }
  const onKey = (e: KeyboardEvent, i: number) => {
    const to = {
      ArrowRight: i + 1,
      ArrowDown: i + 1,
      ArrowLeft: i - 1,
      ArrowUp: i - 1,
      Home: 0,
      End: NODES.length - 1,
    }[e.key]
    if (to === undefined) return
    e.preventDefault()
    const n = Math.max(0, Math.min(NODES.length - 1, to))
    setNode(n)
    refs.current[n]?.focus()
  }
  const chosen = NODES[node]
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid min-w-0 gap-4 rounded-md border border-line p-4"
    >
      <h3 id={`${id}-title`} className="text-lg font-bold">
        From an app to your dashboards: the OpenTelemetry pipeline
      </h3>
      <p id={`${id}-how`} className="text-sm text-ink-muted">
        Walk the steps with the arrow keys; each one says what it does.
      </p>
      <ol
        aria-label="The pipeline, in the order data flows"
        aria-describedby={`${id}-how`}
        className="flex flex-wrap items-stretch gap-2"
      >
        {NODES.map((n, i) => (
          <li key={n.id} className="flex items-center gap-2">
            <button
              type="button"
              ref={(el) => {
                refs.current[i] = el
              }}
              tabIndex={i === node ? 0 : -1}
              aria-current={i === node ? 'step' : undefined}
              aria-describedby={`${id}-${n.id}`}
              onClick={() => {
                setNode(i)
              }}
              onKeyDown={(e) => {
                onKey(e, i)
              }}
              className={cx(
                'grid min-h-11 gap-0.5 rounded-md border-2 border-line bg-raised px-3 py-2 text-left text-sm',
                i === node && 'border-accent',
                focusRing,
              )}
            >
              <span className="font-bold">{n.title}</span>{' '}
              {n.id === 'processors' && (
                <span className="text-xs">
                  memory_limiter{config.k8sattributes ? ', k8sattributes' : ''}
                  {config.sampling < 1 ? ', sampler (1%)' : ''}, batch
                </span>
              )}
              {n.id === 'exporters' && !config.exporterOk && (
                <span className="text-xs font-bold text-alert">
                  ● traces exporter can’t connect
                </span>
              )}
              {n.id === 'sdk' && !config.propagation && (
                <span className="text-xs font-bold text-alert">● not passing trace context</span>
              )}
            </button>
            <span id={`${id}-${n.id}`} className="sr-only">
              {n.detail}
            </span>
            {i < NODES.length - 1 && (
              <span aria-hidden="true" className="text-ink-muted">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
      {chosen && (
        <p className="max-w-prose rounded-md bg-raised p-3 text-sm">
          <span className="font-bold">{chosen.title}:</span> {chosen.detail}
        </p>
      )}
      <fieldset className="grid gap-2">
        <legend className="font-bold">Break something</legend>
        <Checkbox
          label="The SDK passes trace context to the services it calls"
          checked={config.propagation}
          onCheckedChange={(v) => {
            set({ propagation: v })
          }}
        />
        <Checkbox
          label="The traces exporter points at the trace store"
          checked={config.exporterOk}
          onCheckedChange={(v) => {
            set({ exporterOk: v })
          }}
        />
        <Checkbox
          label="The k8sattributes processor adds pod and namespace"
          checked={config.k8sattributes}
          onCheckedChange={(v) => {
            set({ k8sattributes: v })
          }}
        />
        <RadioGroup
          legend="Traces kept"
          value={String(config.sampling)}
          onValueChange={(v) => {
            set({ sampling: v === '0.01' ? 0.01 : 1 })
          }}
          options={[
            { value: '1', label: 'All of them (100%)' },
            { value: '0.01', label: 'One in a hundred (1%)' },
          ]}
        />
      </fieldset>
      <section aria-label="What reaches the trace store" className="grid gap-2">
        <h4 className="font-bold">What reaches the trace store</h4>
        <div role="status" aria-live="polite" className="grid gap-1 text-sm">
          <p className="font-bold">
            {fx.traces.length === 0
              ? 'No traces from the last 100 requests.'
              : `${String(fx.traces.length)} trace${fx.traces.length === 1 ? '' : 's'} from the last 100 requests.`}
          </p>
          <ul className="list-disc pl-6">
            {fx.explanation.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
        {fx.collectorLog && (
          <>
            <p className="text-sm">The Collector’s log:</p>
            <pre className="overflow-x-auto rounded-md bg-term-ground p-2 font-mono text-xs whitespace-pre-wrap text-term-ink [overflow-wrap:anywhere]">
              {fx.collectorLog}
            </pre>
          </>
        )}
        {fx.traces.length > 0 && (
          <div
            // It can scroll sideways, so it must be keyboard-reachable.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            role="group"
            aria-label="The first traces stored"
            className={cx('w-0 min-w-full overflow-x-auto', focusRing)}
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">The first traces stored</caption>
              <thead>
                <tr className="border-b border-line">
                  {['Trace', 'Spans (caller → called)', 'Pods'].map((h) => (
                    <th key={h} scope="col" className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fx.traces.slice(0, 4).map((t) => (
                  <tr
                    key={`${t[0]?.traceId ?? ''}${t[0]?.service ?? ''}`}
                    className="border-b border-line"
                  >
                    <th scope="row" className="p-2 font-mono font-normal">
                      {t[0]?.traceId.slice(0, 8)}
                    </th>
                    <td className="p-2">{t.map((s) => s.service).join(' → ')}</td>
                    <td className="p-2">{t.map((s) => s.pod ?? 'no pod').join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <CodeBlock code={yaml} language="yaml" caption="The Collector’s config (collector.yaml)" />
    </section>
  )
}
