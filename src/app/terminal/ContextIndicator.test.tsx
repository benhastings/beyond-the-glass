import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { Simulator } from '@/sim/core/simulator'
import { scenarioSchema } from '@/sim/core/scenario'
import { miniScenarioInput } from '@/sim/core/testing'
import { createShell, promptState } from '@/sim/commands'
import { ContextIndicator } from './ContextIndicator'

function sim() {
  const base = miniScenarioInput()
  const c0 = base.clusters[0]
  if (!c0) throw new Error('fixture')
  return Simulator.load(
    scenarioSchema.parse({
      ...base,
      contexts: [...base.contexts, { name: 'prod', cluster: 'prod', user: 'prod-admin' }],
      clusters: [c0, { ...c0, name: 'prod', server: 'https://prod.example:6443' }],
    }),
  )
}

describe('ContextIndicator', () => {
  acTest(
    'E6-12.AC1',
    'announces the context and namespace when they change, and marks prod in words',
    () => {
      const s = sim()
      const shell = createShell(s)
      let refresh: () => void = () => undefined
      function Harness() {
        const [state, setState] = useState(promptState(s))
        refresh = () => {
          setState(promptState(s))
        }
        return <ContextIndicator state={state} />
      }
      render(<Harness />)
      const status = screen.getByRole('status')
      // Quiet on first render.
      expect(status).toBeEmptyDOMElement()
      expect(screen.getByText('dev')).toBeInTheDocument()
      expect(screen.queryByText('(production)')).not.toBeInTheDocument()

      act(() => {
        shell.run('kubectl config use-context prod')
        refresh()
      })
      expect(status).toHaveTextContent(
        'Context is now prod, a production cluster, namespace default.',
      )
      expect(screen.getByText('(production)')).toBeInTheDocument()

      act(() => {
        shell.run('kubectl config set-context --current --namespace=shop')
        refresh()
      })
      expect(status).toHaveTextContent('Context is now prod, a production cluster, namespace shop.')

      act(() => {
        shell.run('kubectl config use-context dev')
        refresh()
      })
      expect(status).toHaveTextContent('Context is now dev, namespace shop.')
      expect(screen.queryByText('(production)')).not.toBeInTheDocument()
    },
  )
})
