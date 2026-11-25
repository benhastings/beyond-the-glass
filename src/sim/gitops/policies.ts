// A leaf module (no imports): the schema and timeline events read these while other modules are still
// loading, so they must not sit in a module that's part of an import cycle.

/** Policies a deploy repo's merge request pipeline can enforce (E7-03). */
export const POLICIES = ['no-latest-tag', 'memory-limits'] as const
export type Policy = (typeof POLICIES)[number]

/**
 * How a pipeline can be made to fail (E7-02, E7-03): a failing test or lint, a vulnerable image, a refused
 * push, a wrong tag written to the manifest (the pipeline passes; the deploy doesn't), or a policy denial.
 */
export const CI_FAILURES = ['test', 'lint', 'scan', 'push', 'bad-tag', 'policy'] as const
export type CiFailure = (typeof CI_FAILURES)[number]
