#!/usr/bin/env node
// Serves dist/ the way GitHub Pages does for a project site: under /<base>/, with 404.html (and a 404
// status) for any path that isn't a file. e2e tests run against this, so they exercise the real base
// path and the 404 redirect. Usage: node scripts/serve-pages.mjs [--port 4173] [--base /beyond-the-glass/] [--dir dist]
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const port = Number(arg('port', '4173'))
const base = arg('base', '/beyond-the-glass/')
const dir = arg('dir', 'dist')
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
}

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  if (path === base.slice(0, -1)) {
    res.writeHead(301, { location: base }).end()
    return
  }
  let file = path.startsWith(base) ? normalize(join(dir, path.slice(base.length))) : ''
  if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!file || !file.startsWith(normalize(dir)) || !existsSync(file)) {
    res.writeHead(404, { 'content-type': types['.html'] })
    res.end(req.method === 'HEAD' ? undefined : readFileSync(join(dir, '404.html')))
    return
  }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
  res.end(req.method === 'HEAD' ? undefined : readFileSync(file))
}).listen(port, '127.0.0.1', () => {
  console.log(`serving ${dir} at http://127.0.0.1:${String(port)}${base}`)
})
