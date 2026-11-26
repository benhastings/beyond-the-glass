import { readFileSync } from 'node:fs'
import ravenpost from '@/scenarios/ravenpost.yaml'
import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { createShell } from '@/sim/commands'
import { loadSimulation } from '@/sim/controllers'
import { gitopsScenario } from '@/sim/gitops/testing'
import { instantQuery } from '@/sim/promql/evaluate'
import { parse } from '@/sim/promql/parser'
import { telemetrySource } from '@/sim/promql/source'
import { telemetryScenario } from '@/sim/telemetry/testing'
import { cardCommands, FIELD_CARDS } from './fieldCards'

const REFUSED =
  /command not found|unknown (flag|command|shorthand)|isn't (supported|available)|not supported|Not yet|needs (a|an) /i

describe('E2-07 field cards', () => {
  acTest(
    'E2-07.AC2',
    'every command on the cards runs in the simulator and is in the support matrix',
    () => {
      const matrix = readFileSync('docs/sim/support-matrix.md', 'utf8')
      // kubectl, in the Ravenpost world: placeholders filled with its real names.
      const sim = loadSimulation(ravenpost)
      sim.advance(10 * 60_000)
      const pods = sim.cluster().list('Pod', { namespace: 'ravenpost' })
      const restarted =
        pods.find((p) => (p.status.containerStatuses?.[0]?.restartCount ?? 0) > 0) ?? pods[0]
      const dep = sim.cluster().list('Deployment', { namespace: 'ravenpost' })[0]
      const container = dep?.spec.template.spec.containers[0]
      const values: Record<string, string> = {
        namespace: 'ravenpost',
        pod: restarted?.metadata.name ?? '',
        deployment: dep?.metadata.name ?? '',
        app: dep?.spec.template.metadata.labels?.app ?? '',
        container: container?.name ?? '',
        image: container?.image ?? '',
        file: Object.keys(ravenpost.files)[0] ?? '',
        context: ravenpost.contexts[0]?.name ?? '',
      }
      const fill = (c: string, v: Record<string, string>) =>
        c.replace(/<(\w+)>/g, (m, k: string) => v[k] ?? m)
      const kube = createShell(sim)
      // argocd, in a world with an Argo CD application.
      const g = gitopsScenario()
      g.sim.advance(5 * 60_000)
      const argo = createShell(g.sim)
      const telemetry = telemetryScenario().sim
      telemetry.advance(60 * 60_000)
      let checked = 0
      for (const { card, command } of cardCommands()) {
        if (card.kind === 'promql') {
          expect(() => parse(command), command).not.toThrow()
          expect(
            instantQuery(telemetrySource(telemetry), command, telemetry.now).kind,
            command,
          ).toBe('vector')
          checked++
          continue
        }
        const isArgo = command.startsWith('argocd')
        const line = fill(command, isArgo ? { app: 'shop' } : values)
        expect(line, `${command}: every placeholder is filled`).not.toMatch(/<\w+>/)
        const out = (isArgo ? argo : kube).run(line)
        expect(out.exitCode, `${line}\n${out.stderr}`).not.toBe(127)
        expect(out.stderr, line).not.toMatch(REFUSED)
        // The command's family is documented as supported.
        const [tool, verb, sub] = line.split(' ')
        const family =
          tool === 'argocd'
            ? `argocd ${verb ?? ''} ${sub ?? ''}`
            : `kubectl ${verb === 'config' ? `config ${sub ?? ''}` : (verb ?? '')}`
        // `config` subcommands share one row: \`kubectl config current-context\`, \`use-context NAME\`.
        if (verb === 'config')
          expect(matrix, family).toMatch(new RegExp(`\`(kubectl config )?${sub ?? ''}`))
        else expect(matrix, family).toContain(`\`${family}`)
        checked++
      }
      expect(checked).toBe(cardCommands().length)
      expect(checked).toBeGreaterThan(30)
    },
  )

  acTest('E2-07.AC2', 'card copy follows the tone rules', () => {
    for (const c of FIELD_CARDS) {
      const text = JSON.stringify(c)
      expect(text, c.id).not.toMatch(/\b(simply|just|obviously|easy|trivial)\b/i)
    }
    expect(FIELD_CARDS.map((c) => c.id)).toEqual([
      'kubectl-triage',
      'kubectl-essentials',
      'argocd-essentials',
      'promql-starters',
      'first-five-minutes',
    ])
  })
})
