// @ts-check
import js from '@eslint/js'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/** Packages that must stay framework-free (AGENTS.md §2.4): no React, no app code, no DOM. */
export const FRAMEWORK_FREE = [
  'src/sim/**',
  'src/placement/**',
  'src/progress/**',
  'src/content/**',
]

// Browser APIs that Node also ships, but that a pure package must still not touch: storage,
// the navigator, cross-tab channels and the network belong to src/app.
const browserApisNodeAlsoHas = [
  'localStorage',
  'sessionStorage',
  'Storage',
  'navigator',
  'Navigator',
  'BroadcastChannel',
  'fetch',
  'WebSocket',
  'CloseEvent',
]

// Every browser global the language doesn't provide (window, document, HTMLElement, ...), apart
// from runtime-neutral ones Node shares, such as setTimeout, URL, TextEncoder and CompressionStream.
const domOnlyGlobals = [
  ...Object.keys(globals.browser).filter(
    (name) => !(name in globals.node) && !(name in globals.builtin),
  ),
  ...browserApisNodeAlsoHas,
]

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'docs', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  { files: ['**/*.tsx'], ...jsxA11y.flatConfigs.strict },
  {
    files: ['*.config.{js,ts}', 'tests/**', 'e2e/**', 'scripts/**', 'tools/**'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: FRAMEWORK_FREE,
    languageOptions: { globals: { ...globals.builtin } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'react-*',
                '@radix-ui/*',
                'motion',
                'motion/*',
              ],
              message: 'Framework-free package: no React or UI libraries (AGENTS.md §2.4).',
            },
            {
              group: ['@/app', '@/app/*', '**/app', '**/app/*'],
              message: 'Framework-free package: never import from src/app (AGENTS.md §2.4).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...domOnlyGlobals.map((name) => ({
          name,
          message: 'Framework-free package: no DOM or browser APIs (AGENTS.md §2.4).',
        })),
      ],
    },
  },
  {
    // Determinism (AGENTS.md §2.5, ADR-004): the simulator uses its seeded Rng and SimClock only.
    files: ['src/sim/**'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the simulator Rng (AGENTS.md §2.5).' },
        { object: 'Date', property: 'now', message: 'Use SimClock (AGENTS.md §2.5).' },
        { object: 'performance', property: 'now', message: 'Use SimClock (AGENTS.md §2.5).' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'new Date() reads the real clock; use SimClock (AGENTS.md §2.5).',
        },
      ],
    },
  },
)
