import { defineConfig, devices } from '@playwright/test'

const port = 4173

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
    baseURL: process.env.BASE_URL ?? `http://127.0.0.1:${String(port)}/`,
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
        command: `npm run build && npm run preview -- --port ${String(port)} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${String(port)}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
