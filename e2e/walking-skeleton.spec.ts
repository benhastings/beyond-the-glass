import type { Page } from '@playwright/test'
import { acTest } from './ac.ts'
import { expect, expectNoA11yViolations } from './fixtures.ts'

const LESSON = 'Your first look at the cluster'

/** Answers the Threshold as someone new to all of it: "never", and "I'm not sure yet" to every scenario. */
async function takeQuizAsNewcomer(page: Page) {
  await page.getByRole('link', { name: 'Step up to the Threshold' }).click()
  await page.getByRole('button', { name: 'Begin', exact: true }).click()
  for (let i = 0; i < 20; i++) {
    // The URL says where the quiz is (?q=3, or ?q=review), so there's no racing the screen change.
    await expect(page).toHaveURL(/[?&]q=(\d+|review)/)
    if (page.url().includes('q=review')) break
    const n = /q=(\d+)/.exec(page.url())?.[1] ?? ''
    await expect(page.getByText(new RegExp(`^Question ${n} of \\d+$`))).toBeVisible()
    const notSure = page.getByRole('radio', { name: 'I’m not sure yet' })
    await ((await notSure.count()) ? notSure : page.getByRole('radio').first()).click()
    await page.getByRole('button', { name: 'Next →' }).click()
    await expect(page).not.toHaveURL(new RegExp(`[?&]q=${n}$`))
  }
  await expect(page.getByRole('heading', { name: 'Reviewing your answers' })).toBeVisible()
  await page.getByRole('button', { name: 'See your trail' }).click()
}

async function terminalRun(page: Page, line: string) {
  const input = page.getByRole('textbox', { name: 'Command' })
  await input.fill(line)
  await input.press('Enter')
}

acTest(
  ['E5-07.AC1', 'E5-07.AC2', 'E4-04.AC3'],
  'first lesson end to end: landing → quiz → results → map → lesson → challenge → reopen and continue @smoke',
  async ({ page, browser }) => {
    await page.goto('./')
    await takeQuizAsNewcomer(page)

    // Results: the persona's placement, in words.
    await expect(page.getByText('Your trail begins at the Chartroom.')).toBeVisible()
    await expect(
      page.getByText('Kubernetes: Wayfarer. New to this. We start from the beginning.'),
    ).toBeVisible()
    await expectNoA11yViolations(page)
    // Step through the glass: the Crossing (E1-06) plays, and ends on the map.
    await page.getByRole('button', { name: 'Step through the glass' }).click()
    await expect(page.getByRole('dialog', { name: 'The Crossing' })).toBeHidden({ timeout: 3500 })
    await expect(page.getByRole('heading', { level: 1, name: 'Map of the Reach' })).toBeVisible()
    await page.getByRole('button', { name: 'List view' }).click()
    const chartroom = page.getByRole('link', {
      name: 'The Chartroom, recommended next, 0 of 1 modules',
    })
    await expect(chartroom).toBeVisible()

    // Into the region and the lesson.
    await chartroom.click()
    await page.getByRole('link', { name: 'A first look', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: LESSON })).toBeVisible()
    await page.getByRole('link', { name: 'Next step →' }).click()
    await page.getByRole('link', { name: 'Next step →' }).click()

    // The challenge, in the terminal.
    await terminalRun(page, 'kubectl get pods -n ravenpost')
    await expect(page.getByRole('log', { name: /terminal output/ })).toContainText(
      'CrashLoopBackOff',
    )
    await terminalRun(page, 'answer failing-pod ravenpost-notifier')
    await expect(page.getByText(/^Challenge complete\./)).toBeVisible()
    await expectNoA11yViolations(page)

    // The required check, then finish.
    await page.getByRole('link', { name: 'Next step →' }).click()
    await page.getByRole('radio', { name: /keeps exiting/ }).click()
    await page.getByRole('button', { name: 'Check my answer' }).click()
    await expect(page.getByText('✓ Correct.')).toBeVisible()
    console.log(
      'BEFORE',
      page.url(),
      await page.evaluate<string>(
        'JSON.stringify(JSON.parse(localStorage.getItem("btg:progress")).state.progress.challenges)',
      ),
    )
    await page.getByRole('button', { name: 'Finish lesson' }).click()
    await page.waitForTimeout(1500)
    console.log(
      'AFTER',
      page.url(),
      await page.evaluate<string>(
        'JSON.stringify(JSON.parse(localStorage.getItem("btg:progress")).state.progress.lessons)',
      ),
    )
    await expect(page.getByRole('heading', { name: 'Lesson complete' })).toBeVisible()

    // Close the browser (keeping what the site saved), open it again, and continue.
    const saved = await page.context().storageState()
    await page.context().close()
    const again = await browser.newContext({
      storageState: saved,
      baseURL: new URL(page.url()).origin + new URL(page.url()).pathname,
    })
    const reopened = await again.newPage()
    await reopened.goto('./')
    await reopened.getByRole('link', { name: `Continue: ${LESSON}` }).click()
    await expect(reopened.getByRole('heading', { name: 'Lesson complete' })).toBeVisible()
    await reopened.goto('./#/map?view=list')
    await expect(
      reopened.getByRole('link', { name: 'The Chartroom, complete, 1 of 1 modules' }),
    ).toBeVisible()
    await again.close()
  },
)

acTest(
  'E2-02.AC2',
  'a returning visitor sees Continue pointing to their last incomplete step @smoke',
  async ({ page }) => {
    await page.addInitScript(() => {
      if (localStorage.getItem('btg:progress')) return
      const at = '2026-11-25T10:00:00.000Z'
      const progress = {
        schemaVersion: 1,
        createdAt: at,
        updatedAt: at,
        lessons: { 'your-first-look': { currentStep: 1, completedSteps: ['where-you-are'] } },
        resumeAt: { path: '/lesson/your-first-look/2', at },
      }
      localStorage.setItem('btg:progress', JSON.stringify({ state: { progress }, version: 1 }))
    })
    await page.goto('./')
    const cont = page.getByRole('link', { name: 'Continue: Your first look at the cluster' })
    await expect(cont).toHaveAttribute('href', '#/lesson/your-first-look/2')
    await cont.click()
    await expect(page.getByRole('link', { name: '2. Ask the cluster' })).toHaveAttribute(
      'aria-current',
      'step',
    )
  },
)
