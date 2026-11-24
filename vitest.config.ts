import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

/** Framework-free packages carry the simulator's correctness, so they need more coverage (E0-05.AC2). */
export const PURE_PACKAGES = ['src/sim/**', 'src/placement/**', 'src/progress/**'] as const
export const PURE_LINES = 90
export const GLOBAL_LINES = 70

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: { name: 'unit', environment: 'node', include: ['src/**/*.test.ts'] },
        },
        {
          extends: true,
          test: {
            name: 'dom',
            environment: 'jsdom',
            include: ['src/**/*.test.tsx'],
            setupFiles: ['./src/test/setup-dom.ts'],
          },
        },
        {
          extends: true,
          test: { name: 'repo', environment: 'node', include: ['tests/**/*.test.ts'] },
        },
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
        reporter: ['text-summary', 'html', 'json-summary'],
        thresholds: {
          lines: GLOBAL_LINES,
          ...Object.fromEntries(PURE_PACKAGES.map((glob) => [glob, { lines: PURE_LINES }])),
        },
      },
    },
  }),
)
