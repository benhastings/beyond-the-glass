// Gzipped JS per build, the delta over the React-only baseline, and render time for 6 h of data in Chromium.
import { createServer } from 'node:http'
import { readFileSync, readdirSync } from 'node:fs'
import { extname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'

const gz = (dir) => readdirSync(join(dir, 'assets')).filter((f) => f.endsWith('.js'))
  .reduce((n, f) => n + gzipSync(readFileSync(join(dir, 'assets', f)), { level: 9 }).length, 0)
const kb = (n) => (n / 1024).toFixed(1)
const server = createServer((req, res) => {
  const p = join('dist', decodeURIComponent(new URL(req.url, 'http://x').pathname))
  try { res.writeHead(200, { 'content-type': extname(p) === '.js' ? 'text/javascript' : 'text/html' }).end(readFileSync(p)) } catch { res.writeHead(404).end() }
})
await new Promise((r) => server.listen(4999, r))
const browser = await chromium.launch()
const base = gz('dist/baseline')
console.log('| Build | JS gzipped | Over baseline | Median render, 6 h (ms) |\n|---|---:|---:|---:|')
for (const n of ['baseline', 'recharts', 'visx']) {
  const times = []
  for (let i = 0; i < 9; i++) {
    const page = await browser.newPage()
    await page.goto(`http://localhost:4999/${n}/${n}.html`)
    await page.waitForFunction(() => window.renderMs !== undefined)
    times.push(await page.evaluate(() => window.renderMs))
    await page.close()
  }
  times.sort((a, b) => a - b)
  const size = gz(`dist/${n}`)
  console.log(`| ${n} | ${kb(size)} KB | ${n === 'baseline' ? '—' : `+${kb(size - base)} KB`} | ${times[4].toFixed(1)} |`)
}
await browser.close(); server.close()
