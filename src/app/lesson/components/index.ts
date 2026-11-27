import type { ComponentType } from 'react'
import { CodeBlock } from '../../ui/CodeBlock'
import { Kbd } from '../../ui/Kbd'
import { Analogy } from './Analogy'
import { Check } from './Check'
import { DeepDive } from './DeepDive'
import { Depth } from './Depth'
import { Diagram } from './Diagram'
import { ELI5 } from './ELI5'
import { LessonCallout } from './LessonCallout'
import { LessonTerminal } from './LessonTerminal'
import { Operator } from './Operator'
import { Rosetta } from './Rosetta'
import { LessonOtelPipeline } from './OtelPipelineLazy'
import { Step } from './Step'
import { Term } from './Term'

/**
 * Every component a lesson can use without importing it (E5-02), by the name lessons write. To add one:
 * a new file here, plus one line in this map.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- MDX passes whatever props the author wrote
export const LESSON_COMPONENTS: Readonly<Record<string, ComponentType<any>>> = {
  Step,
  Analogy,
  Callout: LessonCallout,
  Term,
  Diagram,
  CodeBlock,
  Kbd,
  Terminal: LessonTerminal,
  Check,
  Depth,
  ELI5,
  Operator,
  DeepDive,
  OtelPipeline: LessonOtelPipeline,
  Rosetta,
}
