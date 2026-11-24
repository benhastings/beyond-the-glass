import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { contentPlugin } from './src/content/build/vite-plugin.ts'
import { scenarioPlugin } from './src/scenarios/vite-plugin.ts'

// `base: './'` makes every asset URL relative, so one dist/ runs unchanged under
// /beyond-the-glass/ on GitHub Pages, at / in the container, or under any other path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), scenarioPlugin(), contentPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
