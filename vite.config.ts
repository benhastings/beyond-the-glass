import { fileURLToPath } from 'node:url'
import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import remarkFrontmatter from 'remark-frontmatter'
import { defineConfig } from 'vite'
import { challengePlugin } from './src/challenges/vite-plugin.ts'
import { remarkDiagram } from './src/content/build/remark-diagram.ts'
import { contentPlugin } from './src/content/build/vite-plugin.ts'
import { scenarioPlugin } from './src/scenarios/vite-plugin.ts'
import { thresholdPlugin } from './src/content/build/threshold-plugin.ts'

// Lessons (E5-02): components come from the MDX provider, so lessons need no imports; diagrams are
// pre-rendered SVG (remarkDiagram), never Mermaid in the browser.
const lessons = {
  enforce: 'pre' as const,
  ...mdx({
    providerImportSource: '@mdx-js/react',
    remarkPlugins: [remarkFrontmatter, remarkDiagram],
  }),
}

// `base: './'` makes every asset URL relative, so one dist/ runs unchanged under
// /beyond-the-glass/ on GitHub Pages, at / in the container, or under any other path.
export default defineConfig({
  base: './',
  plugins: [
    lessons,
    react({ include: /\.(mdx|jsx|tsx)$/ }),
    tailwindcss(),
    scenarioPlugin(),
    challengePlugin(),
    contentPlugin(),
    thresholdPlugin(),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
