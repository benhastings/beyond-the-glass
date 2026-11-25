import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { EditRequest, Output } from '@/sim/commands/types'
import { Button, Kbd } from '../ui'

export interface InlineEditorProps {
  request: EditRequest
  /** Called once the edit is over (saved or cancelled), with what the terminal prints. */
  onDone: (out: Output) => void
}

/**
 * The editor `kubectl edit` opens (E6-08): a plain textarea with line numbers, so screen readers, browser
 * zoom and every input method work as they do anywhere else. Ctrl+S (or ⌘S) saves, Escape cancels, and
 * Tab leaves the text area for the Save and Cancel buttons (YAML is indented with spaces, so Tab isn't
 * needed for typing). When a save fails, the editor reopens with kubectl's error at the top, announces
 * it, and moves the cursor to the line it names.
 */
export function InlineEditor({ request, onDone }: InlineEditorProps) {
  const [text, setText] = useState(request.text)
  const [error, setError] = useState<string>()
  const area = useRef<HTMLTextAreaElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    area.current?.focus()
    area.current?.setSelectionRange(0, 0)
  }, [])

  const save = () => {
    const step = request.save(text)
    if ('done' in step) {
      onDone(step.done)
      return
    }
    setText(step.reopen)
    setError(step.line ? `Line ${String(step.line)}: ${step.error}` : step.error)
    requestAnimationFrame(() => {
      const el = area.current
      if (!el) return
      el.focus()
      const lines = step.reopen.split('\n')
      const offset = lines.slice(0, Math.max(0, (step.line ?? 1) - 1)).join('\n').length
      el.setSelectionRange(step.line ? offset + 1 : 0, step.line ? offset + 1 : 0)
    })
  }
  const cancel = () => {
    onDone(request.cancel())
  }
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      save()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }
  const lineCount = text.split('\n').length

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="grid gap-2 rounded-md border border-line bg-term-ground p-3 text-term-ink"
    >
      <h3 id={`${id}-title`} className="font-mono text-sm">
        Editing {request.title} <span className="text-term-ink-muted">({request.fileName})</span>
      </h3>
      <p id={`${id}-help`} className="text-sm text-term-ink-muted">
        Lines starting with # are ignored. <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> saves, <Kbd>Esc</Kbd>{' '}
        cancels, and <Kbd>Tab</Kbd> moves to the buttons. Indent with spaces.
      </p>
      <div role="alert" id={`${id}-error`} className="font-mono text-sm text-term-ink">
        {error ? `Not saved. ${error}` : ''}
      </div>
      <div className="flex max-h-[60vh] overflow-hidden rounded border border-term-surface">
        <div
          ref={gutter}
          aria-hidden="true"
          className="select-none overflow-hidden px-2 py-2 text-right font-mono text-sm leading-mono text-term-ink-muted"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={area}
          aria-label={`YAML for ${request.title}`}
          aria-describedby={`${id}-help ${id}-error`}
          aria-invalid={error ? true : undefined}
          value={text}
          onKeyDown={onKeyDown}
          onChange={(e) => {
            setText(e.target.value)
          }}
          onScroll={(e) => {
            if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop
          }}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          wrap="off"
          rows={Math.min(24, lineCount)}
          className="min-h-48 flex-1 resize-y bg-transparent px-2 py-2 font-mono text-sm leading-mono outline-none focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-term-focus focus-visible:outline-solid"
        />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} onKeyDown={onKeyDown}>
          Save
        </Button>
        <Button onClick={cancel} onKeyDown={onKeyDown}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
