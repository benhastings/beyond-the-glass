import { useNavigate } from 'react-router'
import { LEVELS, type Level as LevelName } from '@/progress'
import {
  journey,
  learnerLevels,
  PLACEMENT_DOMAINS,
  score,
  type Answers,
  type PlacementDomain,
} from '@/placement'
import { useManifest } from '../content'
import { useProgress } from '../progress'
import { Button } from '../ui/Button'
import { BANK } from './bank'

const DOMAIN_TITLES: Record<PlacementDomain, string> = {
  foundations: 'Linux, networking and operations',
  containers: 'Containers',
  kubernetes: 'Kubernetes',
  delivery: 'Git, CI/CD and GitOps',
  observability: 'Observability',
}
const LEVEL_TITLES: Record<LevelName, string> = {
  wayfarer: 'Wayfarer',
  deckhand: 'Deckhand',
  navigator: 'Navigator',
  pathfinder: 'Pathfinder',
}
/** What each level means, in plain words. */
export const LEVEL_MEANINGS: Record<LevelName, string> = {
  wayfarer: 'New to this. We start from the beginning.',
  deckhand: 'You’ve seen it. We cover the basics quickly.',
  navigator: 'You use it. We skip the introductions.',
  pathfinder: 'You work with it often. Most of it is optional.',
}

/** Why a domain got its level: the learner's own answers, in their words. */
function why(domain: PlacementDomain, answers: Answers): string[] {
  const out: string[] = []
  for (const item of BANK.items) {
    if (item.domain !== domain || answers[item.id] === undefined) continue
    const chosen = item.options.find((o) => o.id === answers[item.id])
    if (item.kind === 'experience') out.push(`You said: “${chosen?.text ?? ''}”.`)
    else if (answers[item.id] === 'not-sure')
      out.push(`You weren’t sure yet about: “${item.stem}” ${item.why}`)
    else if (answers[item.id] === item.correct) out.push(`You knew: “${item.stem}”`)
    else out.push(`Worth a look: “${item.stem}” ${item.why}`)
  }
  return out
}

/**
 * "Your trail" (E4-04): where the journey begins, the learner's level in each domain as labelled tracks
 * with a text list alongside, why each was suggested, the first modules, and ways to change any of it.
 */
export function Results() {
  const navigate = useNavigate()
  const manifest = useManifest()
  const progress = useProgress((s) => s.progress)
  const overrideLevel = useProgress((s) => s.overrideLevel)
  const chooseStartRegion = useProgress((s) => s.chooseStartRegion)
  const completeThreshold = useProgress((s) => s.completeThreshold)
  const answers: Answers = Object.fromEntries(
    Object.entries(progress.threshold.answers).filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  )
  const scored = score(BANK, answers)
  const levels = learnerLevels(progress)
  const { regions } = journey(manifest, progress)
  const next = regions.find((r) => r.status === 'recommended')
  const startTitle = next?.title ?? manifest.regions[0]?.title ?? 'the Console Room'
  const firstModules = regions
    .flatMap((r) =>
      r.modules
        .filter((m) => m.status !== 'complete' && m.status !== 'optional')
        .map((m) => ({ ...m, region: r.title })),
    )
    .slice(0, 3)
  return (
    <div className="max-w-prose">
      <p className="mt-4 text-2xl">Your trail begins at {startTitle.replace(/^The /, 'the ')}.</p>

      <h2 className="mt-8 text-xl font-bold">Where you’re starting</h2>
      {/* The tracks are a picture of the list below, which says the same in words (AC1). */}
      <div aria-hidden="true" className="mt-3 grid gap-3">
        {PLACEMENT_DOMAINS.map((d) => (
          <div key={d}>
            <p className="text-sm font-bold">{DOMAIN_TITLES[d]}</p>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {LEVELS.map((l, i) => (
                <div
                  key={l}
                  className={`h-3 rounded-full border border-line ${i <= levels[d] ? 'bg-accent' : 'bg-surface'}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <ul className="mt-4 grid gap-3" aria-label="Your level in each area">
        {PLACEMENT_DOMAINS.map((d) => {
          const name = LEVELS[levels[d]]
          const reasons = why(d, answers)
          return (
            <li key={d} className="rounded-md border border-line p-3">
              <p>
                <span className="font-bold">{DOMAIN_TITLES[d]}:</span> {LEVEL_TITLES[name]}.{' '}
                {LEVEL_MEANINGS[name]}
              </p>
              {progress.threshold.overrides[d] && (
                <p className="text-sm">You chose this level yourself.</p>
              )}
              {scored[d].confirm && !progress.threshold.overrides[d] && (
                <p className="text-sm">The first module check in this area will confirm it.</p>
              )}
              {reasons.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer">Why we suggested this</summary>
                  <ul className="mt-1 list-disc pl-6 text-sm">
                    {reasons.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </details>
              )}
              <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                Change my level
                <select
                  value={name}
                  onChange={(e) => {
                    overrideLevel(d, e.target.value as LevelName)
                  }}
                  className="min-h-11 rounded-md border border-line bg-raised px-2"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {LEVEL_TITLES[l]}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          )
        })}
      </ul>

      <h2 className="mt-8 text-xl font-bold">Your first modules</h2>
      {firstModules.length ? (
        <ol className="mt-2 list-decimal pl-6">
          {firstModules.map((m) => (
            <li key={`${m.region}/${m.id}`}>
              {m.title} <span className="text-sm">({m.region})</span>
              {m.reason && <p className="text-sm">{m.reason}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2">
          The first lessons are on their way. The map shows every region in the meantime.
        </p>
      )}

      <h2 className="mt-8 text-xl font-bold">Change my starting point</h2>
      <label className="mt-2 flex flex-wrap items-center gap-2">
        Start in
        <select
          value={progress.threshold.startRegion ?? ''}
          onChange={(e) => {
            chooseStartRegion(e.target.value || undefined)
          }}
          className="min-h-11 rounded-md border border-line bg-raised px-2"
        >
          <option value="">Where my answers suggest</option>
          {manifest.regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-3">
        <Button
          onClick={() => {
            completeThreshold(Object.fromEntries(PLACEMENT_DOMAINS.map((d) => [d, 'wayfarer'])))
            for (const d of PLACEMENT_DOMAINS) overrideLevel(d, undefined)
            chooseStartRegion(undefined)
          }}
        >
          Start from the very beginning
        </Button>
      </p>

      <p className="mt-8">
        <Button
          variant="primary"
          onClick={() => {
            // The Crossing (E1-06) will play here; until then, straight to the map.
            void navigate('/map')
          }}
        >
          Step through the glass
        </Button>
      </p>
    </div>
  )
}
