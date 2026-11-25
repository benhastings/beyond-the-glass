import { parseManifests } from '../commands/kubectl/manifests.ts'
import type { Simulator } from '../core/simulator.ts'
import { repo } from './git.ts'
import type { CiProject, Pipeline } from './pipeline.ts'
export { POLICIES, type Policy } from './policies.ts'

/**
 * Merge request checks for a deploy repo (E7-03): `yaml-lint` parses every changed manifest, `schema`
 * checks each object's shape, `policy-check` applies the scenario's policies. They read the files the MR
 * actually changed, so a learner's mistake fails the pipeline with a message that says what to fix.
 */
export const VALIDATE_JOBS = [
  { name: 'yaml-lint', stage: 'lint', min: 10, max: 20 },
  { name: 'schema', stage: 'validate', min: 15, max: 30 },
  { name: 'policy-check', stage: 'policy', min: 10, max: 20 },
] as const

export interface Finding {
  file: string
  message: string
}

/** The manifests the pipeline's commit changed compared with where its branch started. */
export function changedManifests(sim: Simulator, p: Pipeline): { file: string; text: string }[] {
  const r = repo(sim, p.project)
  const head = r?.commits[p.sha]
  const base = p.base ? r?.commits[p.base] : undefined
  if (!head) return []
  return Object.entries(head.files)
    .filter(([f, text]) => /\.(ya?ml|json)$/.test(f) && base?.files[f] !== text)
    .map(([file, text]) => ({ file, text }))
    .sort((a, b) => (a.file < b.file ? -1 : 1))
}

type Doc = Record<string, unknown> & {
  kind?: unknown
  apiVersion?: unknown
  metadata?: { name?: unknown }
  spec?: {
    template?: {
      spec?: {
        containers?: {
          name?: string
          image?: string
          resources?: { limits?: Record<string, unknown> }
        }[]
      }
    }
  }
}

const containersOf = (d: Doc) => d.spec?.template?.spec?.containers ?? []
const label = (d: Doc) =>
  `${typeof d.kind === 'string' ? d.kind : 'object'} ${typeof d.metadata?.name === 'string' ? d.metadata.name : '(no name)'}`

/** What one check finds; empty when it passes. */
export function findings(
  sim: Simulator,
  p: Pipeline,
  job: string,
  cfg: CiProject | undefined,
): Finding[] {
  const out: Finding[] = []
  for (const { file, text } of changedManifests(sim, p)) {
    const parsed = parseManifests(text)
    if (!parsed.ok) {
      if (job === 'yaml-lint') out.push({ file, message: parsed.error })
      continue
    }
    for (const raw of parsed.docs) {
      if (typeof raw !== 'object' || raw === null) continue
      const d = raw as Doc
      if (job === 'schema') {
        if (typeof d.apiVersion !== 'string')
          out.push({ file, message: `${label(d)}: missing apiVersion` })
        if (typeof d.kind !== 'string') out.push({ file, message: 'an object has no kind' })
        if (typeof d.metadata?.name !== 'string')
          out.push({ file, message: `${label(d)}: missing metadata.name` })
        for (const c of containersOf(d))
          if (!c.image)
            out.push({
              file,
              message: `${label(d)}: container ${c.name ?? '(no name)'} has no image`,
            })
      }
      if (job === 'policy-check')
        for (const c of containersOf(d)) {
          const name = c.name ?? '(no name)'
          if (
            cfg?.policies?.includes('no-latest-tag') &&
            (c.image?.endsWith(':latest') || (c.image && !/:[^/]+$/.test(c.image)))
          )
            out.push({
              file,
              message: `${label(d)}: container ${name} uses the latest tag. Pin a version (registry.example/web:1.4.2), so a rollback goes back to something known.`,
            })
          if (cfg?.policies?.includes('memory-limits') && c.resources?.limits?.memory === undefined)
            out.push({
              file,
              message: `${label(d)}: container ${name} has no memory limit. Set resources.limits.memory, so one pod can't use up its node's memory.`,
            })
        }
    }
  }
  return out
}

/** The script lines a validation job prints, and whether it passed. */
export function validationScript(
  sim: Simulator,
  p: Pipeline,
  job: string,
  cfg: CiProject | undefined,
): { ok: boolean; lines: string[] } {
  const files = changedManifests(sim, p).map((f) => f.file)
  const armed =
    (p.failure === 'lint' && job === 'yaml-lint') ||
    (p.failure === 'policy' && job === 'policy-check')
  const found = findings(sim, p, job, cfg)
  const command =
    job === 'yaml-lint'
      ? `$ yamllint ${files.join(' ') || '.'}`
      : job === 'schema'
        ? `$ kubeconform -strict -summary ${files.join(' ') || '.'}`
        : `$ policy-check --policies ${(cfg?.policies ?? []).join(',') || 'none'} ${files.join(' ') || '.'}`
  if (armed)
    return {
      ok: false,
      lines:
        job === 'yaml-lint'
          ? [
              command,
              files[0] ?? 'manifest.yaml',
              `  1:1  error  missing document start "---"  (document-start)`,
              '',
              'The deploy repo requires each file to start with ---.',
            ]
          : [
              command,
              'DENIED  change-window: deploys to this namespace are frozen until the release review signs off.',
              '',
              'Ask in #ravenpost-releases, or wait for the window to open.',
            ],
    }
  if (found.length === 0)
    return {
      ok: true,
      lines: [
        command,
        job === 'schema'
          ? `Summary: ${String(files.length)} resources found in ${String(files.length)} files - Valid: ${String(files.length)}, Invalid: 0, Errors: 0, Skipped: 0`
          : `Checked ${String(files.length)} file(s): no problems found.`,
      ],
    }
  return {
    ok: false,
    lines: [
      command,
      ...found.map(
        (f) => `${f.file}: ${job === 'policy-check' ? 'DENIED  ' : 'error  '}${f.message}`,
      ),
      '',
      `${String(found.length)} problem(s).`,
    ],
  }
}
