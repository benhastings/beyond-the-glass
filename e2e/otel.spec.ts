import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

acTest(
  ['E8-06.AC1', 'E8-06.AC2'],
  'the OpenTelemetry explainer: walk the pipeline by keyboard, break it, and see the effect',
  async ({ page }) => {
    await page.goto('./#/kitchen-sink')
    const card = page.locator('#otel')
    const flow = card.getByRole('list', { name: 'The pipeline, in the order data flows' })
    await flow.getByRole('button').first().focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(flow.getByRole('button', { name: /^Processors/ })).toBeFocused()
    await expect(card.locator('p', { hasText: /^Processors:/ })).toContainText(
      'memory_limiter (refuse data before running out of memory)',
    )
    await expectNoA11yViolations(page)
    // Turn off context propagation from the keyboard.
    await card.getByRole('checkbox', { name: /passes trace context/ }).focus()
    await page.keyboard.press('Space')
    const status = card
      .getByRole('region', { name: 'What reaches the trace store' })
      .getByRole('status')
    await expect(status).toContainText('300 traces from the last 100 requests.')
    await expect(status).toContainText('traceparent')
    await card.getByRole('radio', { name: 'One in a hundred (1%)' }).click()
    await expect(card.getByRole('region', { name: /yaml/ })).toContainText('probabilistic_sampler')
    await expectNoA11yViolations(page)
  },
)
