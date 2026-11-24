import { Link } from 'react-router'
import { Page } from '../shell/Page'

/** `/threshold`: the placement quiz (E4-02). */
export default function Threshold() {
  return (
    <Page title="The Threshold">
      <p className="mt-4 max-w-prose">
        A few questions to choose your starting trail. There are no wrong answers, and you can
        always change where you start.
      </p>
      <p className="mt-6">
        <Link to="/threshold/results" className="underline focus-visible:outline-2">
          See your trail
        </Link>
      </p>
    </Page>
  )
}
