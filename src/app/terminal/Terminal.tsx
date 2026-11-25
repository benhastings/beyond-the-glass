/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- outputs scroll, so they must be keyboard-reachable */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import {
  clearScreen,
  createShell,
  promptState,
  record,
  transcript,
  type TranscriptEntry,
} from '@/sim/commands'
import type { EditRequest, Output, Session } from '@/sim/commands/types'
import type { Simulator } from '@/sim/core/simulator'
import { Button } from '../ui'
import { cx, focusRing } from '../ui/styles'
import { ContextIndicator } from './ContextIndicator'
import { InlineEditor } from './InlineEditor'

/** Outputs longer than this are summarised for screen readers instead of read out (E6-09). */
export const SHORT_OUTPUT_LINES = 3

export interface TerminalProps {
  sim: Simulator
  /** Called after every command, so the caller can save a snapshot. */
  onChange?: () => void
  label?: string
  /** Extra session hooks, e.g. a challenge's `hint` and `answer` (E6-10). */
  session?: Omit<Session, 'history'>
}

const lineCount = (e: TranscriptEntry) =>
  [e.stdout, e.stderr]
    .filter(Boolean)
    .join('\n')
    .split('\n')
    .filter((l, i, all) => l || i < all.length - 1).length

/** The helper row for touch screens, which have no Tab, arrow or Ctrl keys. */
const MOBILE_KEYS = [
  ['Tab', 'Tab'],
  ['↑', 'Previous command'],
  ['↓', 'Next command'],
  ['Ctrl+C', 'Ctrl+C'],
] as const

/** The words a completion replaces: everything up to the word being typed. */
const commonPrefix = (xs: string[]) =>
  xs.reduce((p, x) => {
    let i = 0
    while (i < p.length && p[i] === x[i]) i++
    return p.slice(0, i)
  }, xs[0] ?? '')

/**
 * The simulator's terminal (E6-09), built from plain HTML: a labelled input and a scrollback made of one
 * group per command (a heading with the command, then its output). Screen readers hear a concise
 * announcement per command from a polite status region: the output itself when it's short, otherwise
 * a line count and how to read it (Alt+O). History (↑/↓), Tab completion (listing candidates when
 * ambiguous), Ctrl+L and Ctrl+C work as in bash. History and scrollback live in the simulation's state.
 */
export function Terminal({ sim, onChange, label = 'Terminal', session }: TerminalProps) {
  const t = transcript(sim)
  const shell = useMemo(
    () => createShell(sim, { ...session, history: t.history }),
    [sim, t.history, session],
  )
  const [entries, setEntries] = useState<TranscriptEntry[]>(() => [...t.entries])
  const [line, setLine] = useState('')
  const [announce, setAnnounce] = useState('')
  const [candidates, setCandidates] = useState<string[]>([])
  const [editing, setEditing] = useState<{
    request: EditRequest
    command: string
    prompt: string
  }>()
  const [closed, setClosed] = useState(false)
  const historyIndex = useRef<number | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const lastOutput = useRef<HTMLPreElement>(null)
  const id = useId()
  const prompt = promptState(sim)
  const promptText = `${prompt.context} ▸ ${prompt.namespace}`

  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      const el = scroller.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }

  const finish = (command: string, promptAt: string, out: Output) => {
    if (out.effect === 'clear') {
      clearScreen(sim)
      setEntries([])
      setAnnounce('Screen cleared.')
      onChange?.()
      return
    }
    const entry = record(sim, promptAt, command, out)
    setEntries([...transcript(sim).entries])
    const n = lineCount(entry)
    const text = [entry.stdout, entry.stderr].filter(Boolean).join('\n')
    setAnnounce(
      `${command}. ${
        n === 0
          ? 'No output.'
          : n <= SHORT_OUTPUT_LINES
            ? text
            : `${String(n)} lines of output; press Alt+O to read.`
      }`,
    )
    if (out.effect === 'exit') setClosed(true)
    onChange?.()
    scrollToEnd()
  }

  const run = (command: string) => {
    setCandidates([])
    historyIndex.current = null
    setLine('')
    const out = shell.run(command)
    if (out.edit) {
      setEditing({ request: out.edit, command, prompt: promptText })
      setAnnounce(`${command}. Opened ${out.edit.title} in the editor.`)
      return
    }
    finish(command, promptText, out)
  }

  const complete = () => {
    const c = shell.complete(line)
    const head = line.slice(0, line.length - c.partial.length)
    if (!c.candidates.length) {
      setAnnounce('No completions.')
      return
    }
    if (c.candidates.length === 1) {
      const only = c.candidates[0] ?? ''
      setLine(`${head}${only}${only.endsWith('/') ? '' : ' '}`)
      setCandidates([])
      setAnnounce(`Completed ${only}.`)
      return
    }
    const prefix = commonPrefix(c.candidates)
    if (prefix.length > c.partial.length) setLine(`${head}${prefix}`)
    setCandidates(c.candidates)
    setAnnounce(
      `${String(c.candidates.length)} completions: ${c.candidates.slice(0, 10).join(', ')}${c.candidates.length > 10 ? ', and more' : ''}.`,
    )
  }

  const recall = (delta: -1 | 1) => {
    const h = t.history
    if (!h.length) return
    const at = historyIndex.current ?? h.length
    const next = Math.min(h.length, Math.max(0, at + delta))
    historyIndex.current = next === h.length ? null : next
    setLine(next === h.length ? '' : (h[next] ?? ''))
  }

  const cancel = () => {
    finish(`${line}^C`, promptText, { stdout: '', stderr: '', exitCode: 130 })
    setLine('')
    setCandidates([])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const ctrl = e.ctrlKey || e.metaKey
    if (e.key === 'Enter') {
      e.preventDefault()
      run(line)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      recall(-1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      recall(1)
    } else if (e.key === 'Tab' && !e.shiftKey && line.trim()) {
      // With nothing typed, Tab moves focus on as usual, so the terminal is never a keyboard trap.
      e.preventDefault()
      complete()
    } else if (ctrl && e.key.toLowerCase() === 'l') {
      e.preventDefault()
      finish('clear', promptText, { stdout: '', stderr: '', exitCode: 0, effect: 'clear' })
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault()
      cancel()
    }
  }

  const press = (key: (typeof MOBILE_KEYS)[number][0]) => {
    if (key === 'Tab') complete()
    else if (key === '↑') recall(-1)
    else if (key === '↓') recall(1)
    else cancel()
    input.current?.focus()
  }

  const onRootKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey && e.key.toLowerCase() === 'o') {
      e.preventDefault()
      lastOutput.current?.focus()
    }
  }

  const copy = (e: TranscriptEntry) => {
    void navigator.clipboard
      .writeText([e.stdout, e.stderr].filter(Boolean).join('\n'))
      .then(() => {
        setAnnounce('Output copied.')
      })
      .catch(() => {
        setAnnounce('Copying isn’t available in this browser; select the text instead.')
      })
  }

  return (
    // The handler only listens for Alt+O, which moves focus to the latest output.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="grid min-w-0 gap-2 rounded-md border border-line bg-term-ground p-3 text-term-ink"
      onKeyDown={onRootKeyDown}
    >
      <h2 className="sr-only">{label}</h2>
      <div
        ref={scroller}
        role="log"
        aria-label={`${label} output`}
        aria-live="off"
        className="max-h-[60vh] min-h-24 min-w-0 overflow-auto font-mono text-sm leading-mono"
      >
        {entries.map((e, i) => {
          const last = i === entries.length - 1
          const n = lineCount(e)
          return (
            <section key={i} aria-labelledby={`${id}-cmd-${String(i)}`} className="mb-2 min-w-0">
              <h3 id={`${id}-cmd-${String(i)}`} className="flex flex-wrap gap-x-2 font-normal">
                <span className="text-term-prompt">{e.prompt} $</span>{' '}
                <span className="break-all">{e.command}</span>
              </h3>
              {n > 0 && (
                <div className="flex min-w-0 items-start gap-2">
                  <pre
                    ref={last ? lastOutput : undefined}
                    // Focusable so a wide or long output can be scrolled from the keyboard (and read with Alt+O).
                    tabIndex={0}
                    role="region"
                    aria-label={`Output of ${e.command}, ${String(n)} lines`}
                    className={cx(
                      'min-w-0 flex-1 overflow-x-auto whitespace-pre',
                      'focus-visible:outline-[3px] focus-visible:outline-term-focus focus-visible:outline-solid',
                    )}
                  >
                    {e.stdout}
                    {e.stdout && e.stderr ? '\n' : ''}
                    {e.stderr && <span className="text-term-warn">{e.stderr}</span>}
                  </pre>
                  <button
                    type="button"
                    onClick={() => {
                      copy(e)
                    }}
                    aria-label={`Copy output of ${e.command}`}
                    className={cx(
                      'shrink-0 rounded border border-term-surface px-2 py-1 text-xs text-term-ink-muted',
                      focusRing,
                    )}
                  >
                    Copy
                  </button>
                </div>
              )}
            </section>
          )
        })}
        {candidates.length > 0 && (
          <p aria-hidden="true" className="whitespace-pre-wrap text-term-ink-muted">
            {candidates.join('  ')}
          </p>
        )}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {announce}
      </div>
      {editing ? (
        <InlineEditor
          request={editing.request}
          onDone={(out) => {
            const { command, prompt: p } = editing
            setEditing(undefined)
            finish(command, p, out)
            requestAnimationFrame(() => input.current?.focus())
          }}
        />
      ) : closed ? (
        <p className="font-mono text-sm">
          Session ended.{' '}
          <Button
            onClick={() => {
              setClosed(false)
              requestAnimationFrame(() => input.current?.focus())
            }}
          >
            Open a new prompt
          </Button>
        </p>
      ) : (
        <div className="grid gap-1">
          <ContextIndicator state={prompt} />
          <div className="flex min-w-0 items-center gap-2 font-mono text-sm">
            <label htmlFor={`${id}-input`} className="text-term-prompt">
              <span aria-hidden="true">$</span>
              <span className="sr-only">Command</span>
            </label>
            <input
              ref={input}
              id={`${id}-input`}
              value={line}
              onChange={(e) => {
                setLine(e.target.value)
                historyIndex.current = null
              }}
              onKeyDown={onKeyDown}
              aria-describedby={`${id}-keys`}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              className="min-w-0 flex-1 bg-transparent text-term-ink outline-none focus-visible:outline-[3px] focus-visible:outline-term-focus focus-visible:outline-solid"
            />
          </div>
          <p id={`${id}-keys`} className="sr-only">
            Up and Down recall history, Tab completes, Control L clears, Control C cancels, Alt O
            reads the last output.
          </p>
          {/* On touch screens there is no Tab key or arrow keys to press. */}
          <div className="flex flex-wrap gap-2 md:hidden" role="group" aria-label="Terminal keys">
            {MOBILE_KEYS.map(([key, name]) => (
              <Button
                key={key}
                aria-label={name}
                onClick={() => {
                  press(key)
                }}
              >
                {key}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
