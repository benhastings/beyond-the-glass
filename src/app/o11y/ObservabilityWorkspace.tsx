import { useState } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import { Tabs } from '../ui/Tabs'
import { DashboardView } from './dashboards/DashboardView'
import { LogsExplorer } from './logs/LogsExplorer'
import { PromqlExplorer } from './PromqlExplorer'
import { TraceExplorer } from './traces/TraceExplorer'

/**
 * Dashboards, metrics, logs and traces over one simulation (E8), linked the way the team's Grafana is:
 * a latency panel's slow requests open their traces (exemplars → Tempo), a log line's trace ID opens the
 * trace at its span (Loki derived fields → Tempo), and a span's "Logs for this span" opens its pod's lines
 * for that trace (Tempo → Loki).
 */
export function ObservabilityWorkspace({ sim }: { sim: Simulator }) {
  const [tab, setTab] = useState('dashboards')
  const [trace, setTrace] = useState<{ traceId: string; spanId?: string }>()
  const [logs, setLogs] = useState<string>()
  const openTrace = (traceId: string, spanId?: string) => {
    setTrace({ traceId, ...(spanId ? { spanId } : {}) })
    setTab('traces')
  }
  return (
    <Tabs
      label="Observability"
      value={tab}
      onValueChange={setTab}
      items={[
        {
          id: 'dashboards',
          label: 'Dashboards',
          content: <DashboardView sim={sim} onOpenTrace={openTrace} />,
        },
        { id: 'metrics', label: 'Metrics', content: <PromqlExplorer sim={sim} level={3} /> },
        {
          id: 'logs',
          label: 'Logs',
          content: (
            <LogsExplorer
              key={logs ?? ''}
              sim={sim}
              {...(logs ? { query: logs } : {})}
              onOpenTrace={openTrace}
              level={3}
            />
          ),
        },
        {
          id: 'traces',
          label: 'Traces',
          content: (
            <TraceExplorer
              key={`${trace?.traceId ?? ''}/${trace?.spanId ?? ''}`}
              sim={sim}
              {...(trace ? { open: trace } : {})}
              onLogsForSpan={(s) => {
                setLogs(`{pod="${s.pod ?? ''}"} |= "${s.traceId}"`)
                setTab('logs')
              }}
              level={3}
            />
          ),
        },
      ]}
    />
  )
}
