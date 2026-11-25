import type { Resource } from '../../core/resources.ts'
import type { DescribeContext } from './common.ts'
import { describeDeployment } from './deployment.ts'
import { describeNode } from './node.ts'
import { describePod } from './pod.ts'
import { describeService } from './service.ts'

export interface Describer {
  /** Plural resource name, as in RESOURCE_TYPES. */
  type: string
  kind: 'Pod' | 'Deployment' | 'Service' | 'Node'
  describe: (obj: never, ctx: DescribeContext) => string
}

/** Types `kubectl describe` supports. To add one: a describer file, plus one line here. */
export const DESCRIBERS: readonly Describer[] = [
  { type: 'pods', kind: 'Pod', describe: describePod },
  { type: 'deployments', kind: 'Deployment', describe: describeDeployment },
  { type: 'services', kind: 'Service', describe: describeService },
  { type: 'nodes', kind: 'Node', describe: describeNode },
]

export const describe = (d: Describer, obj: Resource, ctx: DescribeContext) =>
  d.describe(obj as never, ctx)
export type { DescribeContext } from './common.ts'
