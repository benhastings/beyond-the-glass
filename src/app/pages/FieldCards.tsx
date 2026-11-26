import { Link, useParams } from 'react-router'
import { FIELD_CARDS, type FieldCard } from '@/content/fieldCards'
import { NotFound } from '../shell/NotFound'
import { Page } from '../shell/Page'
import { Button } from '../ui/Button'

const link = 'underline underline-offset-4'

/**
 * `/field-cards` and `/field-cards/:card` (E2-07): cheat sheets to print, one US Letter page each. On
 * screen, a card has a Print button; in print, only the card shows, in black on white.
 */
export default function FieldCards() {
  const { card: id } = useParams()
  const card = id ? FIELD_CARDS.find((c) => c.id === id) : undefined
  if (id && !card) return <NotFound />
  return (
    <Page title={card ? card.title : 'Field cards'}>
      {card ? (
        <>
          <div className="mt-4 flex flex-wrap gap-4 print:hidden">
            <Button
              variant="primary"
              onClick={() => {
                window.print()
              }}
            >
              Print this card
            </Button>
            <Link to="/field-cards" className={`${link} self-center`}>
              All field cards
            </Link>
          </div>
          <CardView card={card} />
        </>
      ) : (
        <>
          <p className="mt-4 max-w-prose">
            Cheat sheets to print and keep by the keyboard. Each fits on one page.
          </p>
          <ul className="mt-4 grid gap-3">
            {FIELD_CARDS.map((c) => (
              <li key={c.id}>
                <Link to={`/field-cards/${c.id}`} className={`${link} font-bold`}>
                  {c.title}
                </Link>
                <p className="text-sm">{c.intro}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}

function CardView({ card }: { card: FieldCard }) {
  return (
    <article
      aria-label={`Field card: ${card.title}`}
      data-field-card={card.id}
      className="mt-6 grid max-w-[8in] gap-3 rounded-md border border-line bg-surface p-6 text-sm print:mt-0 print:max-w-none print:rounded-none print:border-0 print:bg-white print:block print:columns-2 print:gap-8 print:p-0 print:text-[10pt] print:text-black"
    >
      <header className="grid gap-1 border-b-2 border-ink pb-2 print:mb-3 print:border-black print:[column-span:all]">
        <p className="text-xs tracking-wide uppercase">Beyond the Glass · field card</p>
        <p>{card.intro}</p>
      </header>
      {card.sections.map((s) => {
        const List = s.ordered ? 'ol' : 'ul'
        return (
          <section key={s.heading} className="grid gap-1 break-inside-avoid print:mb-3">
            <h2 className="font-bold">{s.heading}</h2>
            <List className={`grid gap-1.5 pl-5 ${s.ordered ? 'list-decimal' : 'list-disc'}`}>
              {s.items.map((i) => (
                <li key={`${i.command ?? ''}${i.text}`}>
                  {i.command && (
                    <code
                      className={`block font-mono font-bold print:text-[9.5pt] ${card.kind === 'promql' ? '[overflow-wrap:anywhere]' : 'break-words'}`}
                    >
                      {i.command}
                    </code>
                  )}
                  <span>{i.text}</span>
                </li>
              ))}
            </List>
          </section>
        )
      })}
    </article>
  )
}
