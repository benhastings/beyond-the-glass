import type { HTMLAttributes, ReactNode } from 'react'
import { cx } from './styles'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Heading text; the card becomes a labelled region. */
  title?: ReactNode
  /** Heading level, so cards fit the page's outline (default 2). */
  level?: 2 | 3 | 4
  as?: 'section' | 'article' | 'div'
}

/** A surface for grouped content. With a title it's a labelled `<section>` (or `<article>`). */
export function Card({
  title,
  level = 2,
  as: Tag = 'section',
  className,
  children,
  id,
  ...props
}: CardProps) {
  const H = `h${String(level)}` as 'h2' | 'h3' | 'h4'
  const headingId = title && id ? `${id}-title` : undefined
  return (
    <Tag
      id={id}
      aria-labelledby={headingId}
      className={cx('rounded-lg border border-line bg-surface p-5 text-ink', className)}
      {...props}
    >
      {title && (
        <H id={headingId} className="mb-3 text-xl font-bold">
          {title}
        </H>
      )}
      {children}
    </Tag>
  )
}
