import { parse, stringify } from 'yaml'
import { describe, expect, it } from 'vitest'
import { acTest } from '@/test/ac'
import {
  collectorConfig,
  effect,
  HEALTHY,
  validateCollectorConfig,
  type PipelineConfig,
} from './pipeline'

const ALL: PipelineConfig[] = [true, false].flatMap((propagation) =>
  [true, false].flatMap((exporterOk) =>
    ([1, 0.01] as const).flatMap((sampling) =>
      [true, false].map((k8sattributes) => ({ propagation, exporterOk, sampling, k8sattributes })),
    ),
  ),
)

describe('E8-06 OpenTelemetry pipeline', () => {
  acTest(
    'E8-06.AC3',
    'every Collector config the explainer shows is valid; broken ones are caught',
    () => {
      expect(ALL).toHaveLength(16)
      for (const c of ALL)
        expect(validateCollectorConfig(collectorConfig(c)), JSON.stringify(c)).toEqual([])
      const healthy = parse(collectorConfig(HEALTHY)) as Record<string, Record<string, unknown>>
      expect(healthy.service).toMatchObject({
        pipelines: {
          traces: {
            processors: ['memory_limiter', 'k8sattributes', 'batch'],
            exporters: ['otlp/tempo'],
          },
        },
      })
      const broken = (f: (d: Record<string, Record<string, unknown>>) => void) => {
        const d = structuredClone(healthy)
        f(d)
        return validateCollectorConfig(stringify(d))
      }
      expect(broken((d) => ((d.processors as Record<string, unknown>).spanmetrics = {}))).toEqual([
        'processors: unknown type "spanmetrics"',
      ])
      expect(
        broken((d) => {
          delete (d.exporters as Record<string, unknown>)['otlp/tempo']
        }),
      ).toEqual(['service.pipelines.traces: exporter "otlp/tempo" isn\'t configured'])
      expect(
        broken(
          (d) =>
            ((
              d.service as { pipelines: { traces: { processors: string[] } } }
            ).pipelines.traces.processors = ['batch', 'memory_limiter']),
        ),
      ).toEqual([
        'service.pipelines.traces: memory_limiter should come first',
        'service.pipelines.traces: batch should come last',
      ])
      expect(
        broken(
          (d) =>
            ((
              (d.exporters as Record<string, { endpoint: string }>)['otlp/tempo'] as {
                endpoint: string
              }
            ).endpoint = 'tempo'),
        ),
      ).toEqual(['exporters.otlp/tempo.endpoint: an endpoint like host:4317'])
      expect(validateCollectorConfig('receivers: [')[0]).toMatch(/^not YAML: /)
    },
  )

  it('each switch changes what reaches the trace store, and says why', () => {
    const ok = effect(HEALTHY)
    expect(ok.kept).toBe(100)
    expect(ok.traces).toHaveLength(100)
    expect(ok.traces[0]?.map((s) => `${s.service}<${s.parent ?? ''}>${s.pod ?? '-'}`)).toEqual([
      'gate<>gate-6c9f7d-2xk4p',
      'api<gate>api-5d8b9c-q7m2n',
      'ledger<api>ledger-7f6d5b-h3j8k',
    ])
    expect(new Set(ok.traces[0]?.map((s) => s.traceId)).size).toBe(1)
    // No propagation: three one-span traces per request.
    const broken = effect({ ...HEALTHY, propagation: false })
    expect(broken.traces).toHaveLength(300)
    expect(broken.traces.every((t) => t.length === 1 && t[0]?.parent === undefined)).toBe(true)
    expect(broken.explanation.join(' ')).toMatch(/traceparent/)
    // A wrong exporter: nothing arrives, and the Collector's log says why.
    const dark = effect({ ...HEALTHY, exporterOk: false })
    expect(dark).toMatchObject({ kept: 0, traces: [] })
    expect(dark.collectorLog).toMatch(/Exporting failed\. Dropping data\..*"name": "otlp\/tempo"/)
    expect(collectorConfig({ ...HEALTHY, exporterOk: false })).toContain('tempo.observabilty.svc')
    // 1% sampling: one request in a hundred.
    const sparse = effect({ ...HEALTHY, sampling: 0.01 })
    expect(sparse.kept).toBe(1)
    expect(collectorConfig({ ...HEALTHY, sampling: 0.01 })).toMatch(
      /probabilistic_sampler:\n\s+sampling_percentage: 1\n/,
    )
    // No k8sattributes: no pods on the spans.
    const anon = effect({ ...HEALTHY, k8sattributes: false })
    expect(anon.traces.flat().every((s) => s.pod === undefined)).toBe(true)
    expect(collectorConfig({ ...HEALTHY, k8sattributes: false })).not.toContain('k8sattributes')
    for (const c of ALL)
      expect(effect(c).explanation.join(' ')).not.toMatch(
        /\b(simply|just|obviously|easy|trivial)\b/i,
      )
  })
})
