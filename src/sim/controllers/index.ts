// Workload controllers and pod lifecycle (E6-02): framework-free. See docs/sim/lifecycle.md.
import type { Scenario } from '../core/scenario.ts'
import { Simulator, type Controller, type SimOptions } from '../core/simulator.ts'
import { deploymentController } from './deployment.ts'
import { argoController } from '../gitops/argo.ts'
import { ciController } from '../gitops/pipeline.ts'
import { gitopsController } from './gitops.ts'
import { kubelet } from './kubelet.ts'
import { replicaSetController } from './replicaset.ts'
import { scheduler } from './scheduler.ts'

/**
 * The controllers a simulated cluster runs, in the order they reconcile after each change:
 * Deployments set ReplicaSet sizes, ReplicaSets create and delete pods, the scheduler binds them,
 * the kubelet runs them. To add one: a new file, plus one line here.
 */
export function defaultControllers(): Controller[] {
  return [
    ciController,
    argoController,
    gitopsController,
    deploymentController,
    replicaSetController,
    scheduler,
    kubelet,
  ]
}

/** A simulation with the full set of controllers running. */
export function loadSimulation(
  scenario: Scenario,
  opts: Omit<SimOptions, 'controllers'> = {},
): Simulator {
  return Simulator.load(scenario, { ...opts, controllers: defaultControllers() })
}

export function restoreSimulation(scenario: Scenario, snapshot: unknown): Simulator {
  return Simulator.restore(scenario, snapshot, { controllers: defaultControllers() })
}

export {
  setImageBehaviour,
  setPodBehaviour,
  behaviourOf,
  type ContainerBehaviour,
} from '../core/behaviour.ts'
export { backoffMs, BACKOFF_RESET_MS, STOP_MS, formatGoDuration } from './kubelet.ts'
export { placePod, podRequests, nodeFree } from './scheduler.ts'
export { rollbackDeployment } from './deployment.ts'
export { manageNamespace, managedBy, DEFAULT_SYNC_MS, type ManagedNamespace } from './gitops.ts'
export { auditLog, recordMutation, type AuditEntry } from '../core/audit.ts'
export { deletionOrder } from './replicaset.ts'
export { cpuMillis, memoryBytes } from './quantity.ts'
