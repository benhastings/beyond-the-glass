import type { Manifest, ModuleEntry } from '../content/schema.ts'
import type { Depth } from '../progress/schema.ts'
import {
  LEVEL_NAMES,
  NOT_SURE,
  PLACEMENT_DOMAINS,
  type Bank,
  type BankItem,
  type PlacementDomain,
} from './bank.ts'

/**
 * The Threshold's engine (E4-03): which questions to ask, how to score the answers, and the path that
 * follows. Pure and deterministic; the rules are in docs/design/placement.md, and the bank and manifest
 * are data, so adding a question or a module needs no code change.
 */

export type Level = 0 | 1 | 2 | 3
/** Item ID → chosen option ID. */
export type Answers = Readonly<Record<string, string>>

export interface DomainScore {
  level: Level
  /** From the experience item. */
  selfReport: Level
  /** From the scenario items: the hardest one answered correctly (0 if none). */
  scenario: Level
  /** Self-report and scenarios disagreed, so the lower was used: the first module check should confirm it. */
  confirm: boolean
}
export type DomainLevels = Record<PlacementDomain, DomainScore>

const DOMAIN_NAMES: Record<PlacementDomain, string> = {
  foundations: 'Linux, networking and operations',
  containers: 'containers',
  kubernetes: 'Kubernetes',
  delivery: 'Git, CI/CD and GitOps',
  observability: 'observability',
}

const byDifficulty = (a: BankItem, b: BankItem) => a.difficulty - b.difficulty

/** The scenario difficulties served for a self-report level (see the serving rule). */
const SCENARIO_DIFFICULTIES: Record<Level, readonly number[]> = {
  0: [1],
  1: [1],
  2: [1, 2],
  3: [2, 3],
}

function selfReportOf(bank: Bank, domain: PlacementDomain, answers: Answers): Level | undefined {
  const item = bank.items.find((i) => i.domain === domain && i.kind === 'experience')
  if (item?.kind !== 'experience') return undefined
  const chosen = item.options.find((o) => o.id === answers[item.id])
  return chosen ? (chosen.level as Level) : undefined
}

/**
 * The questions to ask, in order, as far as the answers so far decide them: per domain, its experience
 * item, then (once that's answered) its scenario items. The quiz asks the first one not yet answered.
 */
export function selectItems(bank: Bank, answers: Answers): BankItem[] {
  const out: BankItem[] = []
  for (const domain of PLACEMENT_DOMAINS) {
    const experience = bank.items.find((i) => i.domain === domain && i.kind === 'experience')
    if (experience) out.push(experience)
    const self = selfReportOf(bank, domain, answers)
    if (self === undefined) continue
    const scenarios = bank.items
      .filter((i) => i.domain === domain && i.kind === 'scenario')
      .sort(byDifficulty)
    const picked: BankItem[] = []
    for (const d of SCENARIO_DIFFICULTIES[self].slice(0, bank.serving.scenariosPerDomain.max)) {
      // The first unused item of that difficulty, or the nearest easier one.
      const item =
        scenarios.find((s) => s.difficulty === d && !picked.includes(s)) ??
        [...scenarios].reverse().find((s) => s.difficulty < d && !picked.includes(s))
      if (item) picked.push(item)
    }
    out.push(...picked)
  }
  return out
}

/** How many questions the quiz will have: exact for decided domains, the bank's average for the rest. */
export function quizLength(bank: Bank, answers: Answers): number {
  const selected = selectItems(bank, answers)
  const pending = PLACEMENT_DOMAINS.filter(
    (d) => selfReportOf(bank, d, answers) === undefined,
  ).length
  const perDomain = Math.max(
    0,
    Math.round((bank.serving.total - PLACEMENT_DOMAINS.length) / PLACEMENT_DOMAINS.length),
  )
  return selected.length + pending * perDomain
}

/** Scores each domain: the lower of self-report and scenarios, flagged when they disagree. */
export function score(bank: Bank, answers: Answers): DomainLevels {
  const out = {} as DomainLevels
  for (const domain of PLACEMENT_DOMAINS) {
    const selfReport = selfReportOf(bank, domain, answers) ?? 0
    let scenario: Level = 0
    let answeredScenario = false
    for (const item of bank.items) {
      if (item.domain !== domain || item.kind !== 'scenario') continue
      const a = answers[item.id]
      if (a === undefined) continue
      answeredScenario = true
      if (a !== NOT_SURE && a === item.correct)
        scenario = Math.max(scenario, item.difficulty) as Level
    }
    // Without any scenario answer there's nothing to disagree with: the self-report stands.
    const effective = answeredScenario ? scenario : selfReport
    const level = Math.min(selfReport, effective) as Level
    out[domain] = {
      level,
      selfReport,
      scenario,
      confirm: answeredScenario && selfReport !== scenario,
    }
  }
  return out
}

/** "Skip the Threshold": everyone starts at the very beginning. */
export function wayfarerEverywhere(): DomainLevels {
  return Object.fromEntries(
    PLACEMENT_DOMAINS.map((d) => [d, { level: 0, selfReport: 0, scenario: 0, confirm: false }]),
  ) as DomainLevels
}

export type ModuleStatus = 'recommended' | 'review' | 'test-out'

export interface PlannedModule {
  regionId: string
  moduleId: string
  title: string
  domain: PlacementDomain
  /** The module's level: its easiest lesson's. */
  level: Level
  status: ModuleStatus
  reason: string
  /** The module's first lesson, if it has any. */
  firstLesson?: string
}

export interface PathPlan {
  modules: PlannedModule[]
  /** Where to begin: the first recommended module (else the first to review, else the first). */
  start?: PlannedModule
  /** Each region's starting depth layer, from the learner's level in its main domain. */
  depthByRegion: Record<string, Depth>
}

export const DEPTH_FOR_LEVEL: Readonly<Record<Level, Depth>> = {
  0: 'eli5',
  1: 'operator',
  2: 'operator',
  3: 'deep',
}

const moduleLevel = (m: ModuleEntry): Level => {
  const levels = m.lessons.map((l) => LEVEL_NAMES.indexOf(l.level) as Level)
  return levels.length ? (Math.min(...levels) as Level) : 0
}

function reason(status: ModuleStatus, learner: Level, domain: PlacementDomain): string {
  const name = DOMAIN_NAMES[domain]
  if (status === 'recommended')
    return learner === 0
      ? `Recommended because you’re new to ${name}.`
      : `Recommended: the next step from what you know about ${name}.`
  if (status === 'review')
    return `Worth a quick review: it matches what you already know about ${name}.`
  return `You can test out: you already know ${name} beyond this.`
}

/** The learner's path through the course, given their level in each domain (overrides already applied). */
export function buildPath(
  levels: Readonly<Record<PlacementDomain, Level>>,
  manifest: Manifest,
): PathPlan {
  const modules: PlannedModule[] = []
  const depthByRegion: Record<string, Depth> = {}
  for (const region of manifest.regions) {
    const counts = new Map<PlacementDomain, number>()
    for (const m of region.modules) {
      const domain = m.domain
      counts.set(domain, (counts.get(domain) ?? 0) + 1)
      const level = moduleLevel(m)
      const learner = levels[domain]
      // At the learner's level or above it's new to them; one level below, worth a review; further
      // below, something they can test out of.
      const status: ModuleStatus =
        learner <= level ? 'recommended' : learner === level + 1 ? 'review' : 'test-out'
      const first = m.lessons[0]?.id
      modules.push({
        regionId: region.id,
        moduleId: m.id,
        title: m.title,
        domain,
        level,
        status,
        reason: reason(status, learner, domain),
        ...(first ? { firstLesson: first } : {}),
      })
    }
    // The region's main domain: the one most of its modules teach (ties: the first one).
    const main = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    if (main) depthByRegion[region.id] = DEPTH_FOR_LEVEL[levels[main]]
  }
  const start =
    modules.find((m) => m.status === 'recommended') ??
    modules.find((m) => m.status === 'review') ??
    modules[0]
  return { modules, ...(start ? { start } : {}), depthByRegion }
}

/** Just the levels, for buildPath and for storing as the placement. */
export const levelsOf = (s: DomainLevels): Record<PlacementDomain, Level> =>
  Object.fromEntries(PLACEMENT_DOMAINS.map((d) => [d, s[d].level])) as Record<
    PlacementDomain,
    Level
  >
