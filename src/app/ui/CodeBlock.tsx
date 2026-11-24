/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- the code region scrolls, so it must be keyboard-reachable */
import { useId, useState } from 'react'
import { Button } from './Button'

export interface CodeBlockProps {
  code: string
  /** Shown as a label and read out ("yaml", "shell", "promql"). */
  language: string
  /** Optional caption naming the block. */
  caption?: string
}

/**
 * Code or a command, with its language labelled and a Copy button. The copy result is announced in a
 * polite live region; if the clipboard is unavailable, the text is selected for the learner to copy.
 */
export function CodeBlock({ code, language, caption }: CodeBlockProps) {
  const id = useId()
  const [status, setStatus] = useState('')
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setStatus('Copied to the clipboard.')
    } catch {
      const pre = document.getElementById(`${id}-code`)
      if (pre) window.getSelection()?.selectAllChildren(pre)
      setStatus('Selected. Press Ctrl+C (or ⌘+C) to copy.')
    }
  }
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-term-ground text-term-ink">
      <figcaption className="flex items-center justify-between gap-3 border-b border-term-surface px-3 py-1 text-sm">
        <span>
          {caption ? `${caption} · ` : ''}
          <span className="font-mono text-term-ink-muted">{language}</span>
        </span>
        <Button
          variant="ghost"
          className="text-term-ink"
          onClick={() => void copy()}
          aria-describedby={`${id}-code`}
        >
          Copy
        </Button>
      </figcaption>
      {/* Focusable so keyboard users can scroll long lines (axe: scrollable-region-focusable). */}
      <pre
        id={`${id}-code`}
        tabIndex={0}
        role="region"
        aria-label={`${language} code`}
        className="overflow-x-auto p-3 font-mono text-sm leading-mono focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-term-focus focus-visible:outline-solid"
      >
        <code>{code}</code>
      </pre>
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>
    </figure>
  )
}
