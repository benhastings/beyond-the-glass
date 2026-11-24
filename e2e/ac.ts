import { acTitle, type AcTag } from '../src/test/ac-title.ts'
import { test } from './fixtures.ts'

type Body = Parameters<typeof test>[2]

/**
 * Playwright `test` for an acceptance criterion, with the shared fixtures. The tracer reads the tags
 * from the first argument.
 *
 *   acTest('E5-07.AC1', 'landing → quiz → lesson → resume', async ({ page }) => { ... })
 */
export function acTest(tags: AcTag | AcTag[], title: string, body: Body) {
  test(acTitle(tags, title), body)
}
acTest.skip = (tags: AcTag | AcTag[], title: string, body: Body) => {
  test.skip(acTitle(tags, title), body)
}
acTest.fixme = (tags: AcTag | AcTag[], title: string, body: Body) => {
  test.fixme(acTitle(tags, title), body)
}
