import { defineCommand } from '../types.ts'
import { labelLike } from './label-like.ts'

/** `kubectl annotate` (E6-07). */
export const kubectlAnnotate = defineCommand(labelLike('annotate'))
