import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parse as parseYaml } from 'yaml'
import { beforeEach, describe, expect } from 'vitest'
import { acTest } from '@/test/ac'
import { checksFile, type Check } from '@/content/checks'
import sample from '../../../../content/_samples/components.checks.yaml?raw'
import { useProgress } from '../../progress'
import { KnowledgeCheck } from './KnowledgeCheck'

const CHECKS = checksFile.parse(parseYaml(sample)).checks
const get = (id: string) => CHECKS.find((c) => c.id === id) as Check
const show = (id: string) => {
  cleanup()
  render(<KnowledgeCheck check={get(id)} />)
  return {
    user: userEvent.setup(),
    submit: () => screen.getByRole('button', { name: 'Check my answer' }),
  }
}
const status = () =>
  screen.getAllByRole('status').find((s) => s.getAttribute('aria-live') === 'polite')

describe('E5-03 knowledge checks', () => {
  beforeEach(() => {
    useProgress.getState().reset()
  })

  acTest('E5-03.AC1', 'single and multiple choice work from the keyboard', async () => {
    let { user } = show('sample-single')
    // Options are shown in a stable shuffled order (#145), so follow the order on screen.
    const radios = screen.getAllByRole('radio')
    await user.tab()
    expect(radios[0]).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(radios[1]).toBeChecked()
    // A wrong answer, chosen from the keyboard: focus moves to it with the arrows.
    const scheduler = screen.getByRole('radio', { name: 'The scheduler' })
    while (!(scheduler as HTMLInputElement).checked) await user.keyboard('{ArrowDown}')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(status()).toHaveTextContent(
      'Not yet.The scheduler only decides which node a pod runs on.',
    )
    await user.click(screen.getByRole('radio', { name: 'The kubelet' }))
    await user.keyboard('{Tab}{Enter}')
    expect(status()).toHaveTextContent(/^✓ Correct\./)
    expect(screen.getByText(/CrashLoopBackOff/)).toBeInTheDocument()
    expect(useProgress.getState().progress.checks['sample-single']).toMatchObject({
      attempts: 2,
      passed: true,
    })
    ;({ user } = show('sample-multiple'))
    // Tab through the boxes in the order shown, pressing Space on the two right ones.
    const right = ['kubectl describe pod', 'kubectl logs --previous']
    for (const box of screen.getAllByRole('checkbox')) {
      await user.tab()
      expect(box).toHaveFocus()
      if (right.some((r) => box.closest('label')?.textContent.includes(r))) await user.keyboard(' ')
    }
    await user.tab()
    await user.keyboard('{Enter}')
    expect(status()).toHaveTextContent(/✓ Correct/)
  })

  acTest(
    'E5-03.AC1',
    'ordering uses Move up / Move down buttons and announces each move',
    async () => {
      const { user, submit } = show('sample-ordering')
      const order = () =>
        within(screen.getByRole('list'))
          .getAllByRole('listitem')
          .map((li) => li.textContent.replace(/^\d+\.|↑ Up↓ Down$/g, ''))
      const want =
        get('sample-ordering').type === 'ordering'
          ? (get('sample-ordering') as Extract<Check, { type: 'ordering' }>).items.map(
              (i) => i.text,
            )
          : []
      expect(order()).not.toEqual(want)
      // Sort by moving each wanted item up until it's in place, from the keyboard.
      for (let target = 0; target < want.length; target++) {
        for (;;) {
          const at = order().indexOf(want[target] ?? '')
          if (at === target) break
          const up = screen.getByRole('button', { name: `Move “${want[target] ?? ''}” up` })
          up.focus()
          await user.keyboard('{Enter}')
        }
      }
      expect(order()).toEqual(want)
      expect(screen.getAllByRole('status')[0]).toHaveTextContent(/moved to position \d of 4\./)
      expect(screen.getByRole('button', { name: `Move “${want[0] ?? ''}” up` })).toBeDisabled()
      submit().focus()
      await user.keyboard('{Enter}')
      expect(status()).toHaveTextContent('✓ Correct.That’s the right order.')
    },
  )

  acTest('E5-03.AC1', 'matching uses a labelled select per item', async () => {
    const { user, submit } = show('sample-matching')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'journalctl -u web' }),
      'kubectl logs deploy/web',
    )
    await user.click(submit())
    expect(status()).toHaveTextContent('Match every item.')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'systemctl restart web' }),
      'kubectl get pods',
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'ps aux' }),
      'kubectl rollout restart deploy/web',
    )
    await user.click(submit())
    expect(status()).toHaveTextContent('1 of 3 matches are right.')
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'systemctl restart web' }),
      'kubectl rollout restart deploy/web',
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'ps aux' }), 'kubectl get pods')
    await user.click(submit())
    expect(status()).toHaveTextContent(/✓ Correct/)
  })

  acTest(
    'E5-03.AC2',
    'spot-the-bug is a listbox of numbered lines, operable with arrow keys',
    async () => {
      const { user, submit } = show('sample-bug')
      const box = screen.getByRole('listbox', { name: /choose the line with the bug/ })
      const options = within(box).getAllByRole('option')
      expect(options).toHaveLength(9)
      expect(options[5]).toHaveAccessibleName(/^Line\s*6:\s*replicas: three$/)
      await user.tab()
      expect(box).toHaveFocus()
      expect(box).toHaveAttribute('aria-activedescendant', options[0]?.id)
      await user.keyboard('{ArrowDown}{Enter}')
      expect(options[1]).toHaveAttribute('aria-selected', 'true')
      submit().focus()
      await user.keyboard('{Enter}')
      expect(status()).toHaveTextContent('Not yet.Deployment is the right kind for this.')
      box.focus()
      await user.keyboard('{End}{ArrowUp}{ArrowUp}{ArrowUp}')
      await user.keyboard('{Home}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown} ')
      expect(options[5]).toHaveAttribute('aria-selected', 'true')
      await user.click(submit())
      expect(status()).toHaveTextContent(/✓ Correct/)
    },
  )

  acTest(
    'E5-03.AC3',
    'feedback is announced through a polite live region, and retries are unlimited',
    async () => {
      const { user, submit } = show('sample-single')
      const live = status()
      expect(live).toHaveAttribute('aria-live', 'polite')
      expect(live).toBeEmptyDOMElement()
      for (let i = 0; i < 4; i++) {
        await user.click(screen.getByRole('radio', { name: 'You do, by hand' }))
        await user.click(submit())
        expect(live).toHaveTextContent(
          'Not yet.Not any more. Something in the cluster does it for you.',
        )
      }
      await user.click(submit())
      expect(useProgress.getState().progress.checks['sample-single']?.attempts).toBe(5)
      await user.click(screen.getByRole('radio', { name: 'The kubelet' }))
      await user.click(submit())
      expect(live).toHaveTextContent(/✓ Correct/)
    },
  )
})
