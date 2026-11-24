import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, normalize } from 'node:path'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import viteConfig from '../../vite.config.ts'
import { ROOT, cleanCheckout, run } from './helpers.ts'

describe('E0-01 scaffold', () => {
  it('[E0-01.AC1] npm ci, typecheck, lint and build succeed on a clean checkout', () => {
    const dir = cleanCheckout()
    try {
      expect(existsSync(join(dir, 'node_modules'))).toBe(false)
      run('npm', ['ci', '--no-audit', '--no-fund', '--prefer-offline'], dir)
      run('npm', ['run', 'typecheck'], dir)
      run('npm', ['run', 'lint'], dir)
      run('npm', ['run', 'build'], dir)
      expect(existsSync(join(dir, 'dist', 'index.html'))).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 300_000)

  describe('[E0-01.AC2] framework-free boundary', () => {
    const eslint = new ESLint({ cwd: ROOT, overrideConfig: tseslint.configs.disableTypeChecked })
    const boundaryErrors = async (code: string, filePath: string) => {
      const [result] = await eslint.lintText(code, { filePath: join(ROOT, filePath) })
      return (result?.messages ?? []).filter(
        (m) => m.ruleId === 'no-restricted-imports' || m.ruleId === 'no-restricted-globals',
      )
    }
    const violations = {
      'react import': "import { useState } from 'react'\nexport const s = useState\n",
      'react-dom import':
        "import { createRoot } from 'react-dom/client'\nexport const c = createRoot\n",
      'app import (alias)': "import { App } from '@/app/App'\nexport const a = App\n",
      'app import (relative)': "import { App } from '../../app/App'\nexport const a = App\n",
      document: 'export const t = document.title\n',
      window: 'export const w = window.innerWidth\n',
      localStorage: "export const v = localStorage.getItem('k')\n",
      sessionStorage: "export const v = sessionStorage.getItem('k')\n",
      navigator: 'export const l = navigator.language\n',
      fetch: "export const r = () => fetch('https://x.example')\n",
      HTMLElement: 'export const isEl = (x: unknown) => x instanceof HTMLElement\n',
    }

    for (const [name, code] of Object.entries(violations)) {
      it(`[E0-01.AC2] rejects ${name} in src/sim`, async () => {
        expect(await boundaryErrors(code, 'src/sim/core/fixture.ts')).not.toHaveLength(0)
      })
    }

    it('[E0-01.AC2] allows plain TypeScript and runtime-neutral globals in src/sim', async () => {
      const code =
        "export const later = (f: () => void) => setTimeout(f, 1)\nexport const u = new URL('https://x.example')\nexport const enc = new TextEncoder()\n"
      expect(await boundaryErrors(code, 'src/sim/core/fixture.ts')).toEqual([])
    })

    it('[E0-01.AC2] does not restrict src/app', async () => {
      expect(
        await boundaryErrors(
          violations['react import'] + violations.document,
          'src/app/fixture.tsx',
        ),
      ).toEqual([])
    })
  })

  describe('[E0-01.AC3] relative base: one build, any path', () => {
    let dist: string
    let server: Server
    let origin: string

    beforeAll(async () => {
      dist = join(ROOT, 'node_modules', '.tmp', 'ac3-dist')
      run('npx', ['vite', 'build', '--outDir', dist, '--emptyOutDir', '--logLevel', 'error'], ROOT)
      // Serve the same dist/ at "/", "/beyond-the-glass/" and a deeper prefix.
      server = createServer((req, res) => {
        const path = new URL(req.url ?? '/', 'http://x').pathname
        const prefix = ['/beyond-the-glass/', '/a/b/c/', '/'].find((p) => path.startsWith(p)) ?? '/'
        const rel = normalize(path.slice(prefix.length) || 'index.html')
        const file = join(dist, rel)
        if (!file.startsWith(dist) || !existsSync(file)) {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200).end(readFileSync(file))
      })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
    }, 120_000)

    afterAll(() => {
      server.close()
    })

    it('[E0-01.AC3] vite.config.ts sets base to ./', () => {
      expect(viteConfig.base).toBe('./')
    })

    for (const prefix of ['/', '/beyond-the-glass/', '/a/b/c/']) {
      it(`[E0-01.AC3] every asset in index.html loads when served under ${prefix}`, async () => {
        const html = await (await fetch(origin + prefix)).text()
        const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1] ?? '')
        expect(refs.length).toBeGreaterThan(1)
        for (const ref of refs) {
          expect(ref, `${ref} must be relative`).toMatch(/^\.\//)
          const res = await fetch(new URL(ref, origin + prefix))
          expect(res.status, `${ref} under ${prefix}`).toBe(200)
        }
      })
    }
  })

  it('[E0-01.AC4] README Getting started documents every npm script', () => {
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8')
    const section = /^## Getting started\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(readme)?.[1]
    expect(section, 'README needs a "## Getting started" section').toBeTruthy()
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    for (const script of Object.keys(pkg.scripts)) {
      expect(section, `npm run ${script} is undocumented`).toMatch(
        new RegExp(`npm (?:run )?${script}\\b`),
      )
    }
  })
})
