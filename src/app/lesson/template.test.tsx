import { render, screen } from '@testing-library/react'
import { parse as parseYaml } from 'yaml'
import { MemoryRouter } from 'react-router'
import { describe, expect, vi } from 'vitest'
import { acTest } from '@/test/ac'
import { checksFile } from '@/content/checks'
import Template from '../../../content/_template/module-template/lesson-template.mdx'
import checks from '../../../content/_template/module-template/lesson-template.checks.yaml?raw'
import { MdxContent } from './MdxContent'

vi.mock('../content', () => ({
  useManifest: () => ({
    regions: [],
    glossary: [{ id: 'pod', term: 'Pod', aliases: [], related: [], eli5: 'A box.', operator: 'o' }],
  }),
}))

describe('E5-06 template', () => {
  acTest('E5-06.AC2', 'the template lesson renders every part', async () => {
    render(
      <MemoryRouter>
        <MdxContent Body={Template} checks={checksFile.parse(parseYaml(checks)).checks} />
      </MemoryRouter>,
    )
    for (const title of ['Where you are', 'Take a look', 'Check your understanding'])
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Analogy' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'How deep to go' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'pod' })).toHaveAttribute('href', '/guide/pod')
    expect(
      screen.getByRole('heading', { name: /A pod's container keeps exiting/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Opening the terminal|Find the pod/)).toBeInTheDocument()
  })
})
