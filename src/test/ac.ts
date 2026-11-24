import { it, type TestFunction } from 'vitest'
import { acTitle, type AcTag } from './ac-title'

export { acTitle, type AcTag }

/**
 * Vitest `it` for an acceptance criterion. Keep the tags on the `acTest(` line: the tracer reads them
 * from there. `acTest.skip`/`.todo` never count as traced.
 *
 *   acTest('E6-04.AC2', 'parser never throws', () => { ... })
 */
export function acTest(tags: AcTag | AcTag[], title: string, fn: TestFunction, timeout?: number) {
  it(acTitle(tags, title), fn, timeout)
}
acTest.skip = (tags: AcTag | AcTag[], title: string, fn: TestFunction) => {
  it.skip(acTitle(tags, title), fn)
}
acTest.todo = (tags: AcTag | AcTag[], title: string) => {
  it.todo(acTitle(tags, title))
}
