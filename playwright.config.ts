import { defineConfig, devices } from '@playwright/test'

const port = 4173

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['junit', { outputFile: 'reports/playwright.xml' }]]
    : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? `http://127.0.0.1:${String(port)}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run build && npm run preview -- --port ${String(port)} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${String(port)}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
