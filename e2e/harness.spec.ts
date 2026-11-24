import { blockThirdPartyRequests, expect, expectNoA11yViolations, test } from './fixtures.ts'

// These prove the harness itself catches problems, so a green e2e run means something.
test.describe('test harness', () => {
  test('[E0-05.AC3] expectNoA11yViolations fails on a serious or critical violation', async ({
    page,
  }) => {
    // An image with no alt text is a critical violation (image-alt); a button with no name is too.
    await page.setContent(
      '<main><h1>t</h1><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><button></button></main>',
    )
    const failure = await expectNoA11yViolations(page).then(
      () => null,
      (e: unknown) => String(e),
    )
    expect(failure).toContain('image-alt')
    expect(failure).toContain('button-name')
  })

  test('[E0-05.AC3] expectNoA11yViolations passes an accessible page', async ({ page }) => {
    await page.setContent(
      '<html lang="en"><title>t</title><main><h1>Fine</h1><button>Go</button></main></html>',
    )
    await expectNoA11yViolations(page)
  })

  test('blockThirdPartyRequests aborts and records requests to other origins', async ({
    browser,
    baseURL,
  }) => {
    const page = await browser.newPage()
    const origin = new URL(baseURL ?? '').origin
    const blocked = await blockThirdPartyRequests(page, origin)
    await page.goto('./')
    await page.evaluate(async () => {
      await fetch('https://third-party.example/beacon').catch(() => undefined)
    })
    expect(blocked).toEqual(['https://third-party.example/beacon'])
    await page.close()
  })
})
