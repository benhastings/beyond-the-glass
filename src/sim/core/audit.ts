import type { Simulator } from './simulator.ts'

/**
 * Every change made to a cluster through the simulator: by the learner's commands and by Argo CD's
 * self-heal. The challenge engine (E4) reads this to check *how* a task was done ("did they roll back
 * rather than delete the pods?"); it is kept in snapshots, so it survives a reload.
 */
export interface AuditEntry {
  /** Sim time, ms since scenario start. */
  t: number
  actor: 'learner' | 'argocd'
  cluster: string
  /** kubectl's verb: `delete`, `scale`, `rollout-undo`, `set-image`, `label`, `sync`, … */
  verb: string
  kind: string
  namespace?: string
  name: string
  /** The command line that made the change, when there was one. */
  command?: string
  /** Verb-specific facts: `{ from: 2, to: 5 }`, `{ container, image }`, `{ revision }`, … */
  detail?: Record<string, unknown>
}

const log = (sim: Simulator) =>
  sim.state<{ entries: AuditEntry[] }>('audit', () => ({ entries: [] }))

export function recordMutation(sim: Simulator, e: Omit<AuditEntry, 't'>): AuditEntry {
  const entry = { t: sim.now, ...e }
  log(sim).entries.push(entry)
  return entry
}

/** The audit log, oldest first. A copy: changing it doesn't change the record. */
export function auditLog(sim: Simulator): AuditEntry[] {
  return structuredClone(log(sim).entries)
}
