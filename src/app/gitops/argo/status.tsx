import type { HealthStatus, SyncStatus } from '@/sim/gitops/argo'
import { StatusPill, type Status } from '../../ui/StatusPill'

const HEALTH: Record<HealthStatus, Status> = {
  Healthy: 'ok',
  Progressing: 'info',
  Degraded: 'alert',
  Suspended: 'warn',
  Missing: 'warn',
  Unknown: 'neutral',
}
const SYNC: Record<SyncStatus, Status> = { Synced: 'ok', OutOfSync: 'warn', Unknown: 'neutral' }

/** Health as an icon and a word (never colour alone). */
export function HealthPill({ health }: { health: HealthStatus }) {
  return <StatusPill status={HEALTH[health]}>{health}</StatusPill>
}

export function SyncPill({ sync }: { sync: SyncStatus }) {
  return <StatusPill status={SYNC[sync]}>{sync === 'OutOfSync' ? 'Out of sync' : sync}</StatusPill>
}

/** The short kind labels Argo CD's tree uses. */
export const KIND_SHORT: Record<string, string> = {
  Application: 'app',
  Deployment: 'deploy',
  ReplicaSet: 'rs',
  Pod: 'pod',
  Service: 'svc',
  Endpoints: 'ep',
  ConfigMap: 'cm',
  Secret: 'secret',
}
