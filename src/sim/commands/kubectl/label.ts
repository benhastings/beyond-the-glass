import { defineCommand } from '../types.ts'
import { labelLike } from './label-like.ts'

/** `kubectl label` (E6-07). */
export const kubectlLabel = defineCommand(labelLike('label'))
