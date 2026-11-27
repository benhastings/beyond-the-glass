import { useId, useState } from 'react'
import type { Simulator } from '@/sim/core/simulator'
import { pipelines } from '@/sim/gitops/pipeline'
import { Button } from '../ui/Button'
import { PipelineView } from './PipelineView'

/**
 * Every CI pipeline in a simulation, newest first, each with its stages, jobs and job logs (E9-07: reading
 * a pipeline in a lesson). Refresh picks up pipelines that ran since.
 */
export function PipelinesPanel({ sim }: { sim: Simulator }) {
  const id = useId()
  const [, setVersion] = useState(0)
  const all = [...pipelines(sim)].reverse()
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="text-lg font-bold">
          Pipelines ({all.length})
        </h3>
        <Button
          variant="ghost"
          onClick={() => {
            setVersion((v) => v + 1)
          }}
        >
          Refresh
        </Button>
      </div>
      {all.length === 0 ? (
        <p>No pipelines have run yet.</p>
      ) : (
        all.map((p) => <PipelineView key={p.id} pipeline={p} now={sim.now} level={4} />)
      )}
    </section>
  )
}
