/**
 * The names lessons may use as components (E5-02): the keys of the app's LESSON_COMPONENTS registry. The
 * content build rejects any other capitalised tag, so a lesson can't ship using a component that doesn't
 * exist (it would fail only when a learner opened that step). A test keeps this list and the registry equal.
 */
export const LESSON_COMPONENT_NAMES = [
  'Step',
  'Analogy',
  'Callout',
  'Term',
  'Diagram',
  'CodeBlock',
  'Kbd',
  'Terminal',
  'Check',
  'Depth',
  'ELI5',
  'Operator',
  'DeepDive',
  'OtelPipeline',
  'Rosetta',
  'IncidentNote',
] as const
