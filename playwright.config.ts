import { defineConfig, devices } from '@playwright/test'

const port = 4173
// e2e runs against dist/ served the way GitHub Pages serves it: under the repo's base path, with 404.html.
const local = `http://127.0.0.1:${String(port)}/beyond-the-glass/`

export default defineConfig({
  testDir: './e2e',
  // Where traces and failure screenshots land; CI uploads this directory when a run fails (E0-05.AC4).
  outputDir: 'test-results',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'reports/playwright.xml' }], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? local,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run build && node scripts/serve-pages.mjs --port ${String(port)}`,
        url: local,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
