import { Page } from '../shell/Page'

/** `/lead`: read a learner's progress code (E3-05). */
export default function Lead() {
  return (
    <Page title="Lead view">
      <p className="mt-4 max-w-prose">
        Paste a learner&apos;s progress code here to see where they are.
      </p>
    </Page>
  )
}
