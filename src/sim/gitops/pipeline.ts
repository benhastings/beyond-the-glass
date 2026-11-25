import { setImageBehaviour } from '../core/behaviour.ts'
import { fnv1a32 } from '../core/rng.ts'
import type { Controller, Simulator } from '../core/simulator.ts'
import { commit, repo, resolve, shortSha } from './git.ts'
import { pushImage } from './registry.ts'

/**
 * GitLab CI pipelines (E7-02): build → test → scan → package → update-manifests. Jobs run on the sim clock
 * with deterministic durations; outcomes come from the scenario (a `pipeline` or `ciFailure` timeline
 * event), never from chance. A green run pushes the image and commits its tag to the deploy repo, where
 * Argo CD (E7-01) picks it up.
 */
export const STAGES = ['build', 'test', 'scan', 'package', 'update-manifests'] as const
export type Stage = (typeof STAGES)[number]
export type JobStatus = 'created' | 'running' | 'success' | 'failed' | 'skipped'
export type PipelineStatus = 'running' | 'success' | 'failed'
/** What goes wrong, if anything: a failing test or lint, a vulnerable image, a refused push, or a wrong tag written to the manifest (the pipeline passes; the deploy doesn't). */
export const CI_FAILURES = ['test', 'lint', 'scan', 'push', 'bad-tag'] as const
export type CiFailure = (typeof CI_FAILURES)[number]

export interface LogSection {
  id: string
  title: string
  lines: string[]
  durationMs: number
}

export interface Job {
  id: number
  name: string
  stage: Stage
  status: JobStatus
  durationMs: number
  startedAt?: number
  finishedAt?: number
  sections: LogSection[]
}

export interface Pipeline {
  id: number
  project: string
  ref: string
  sha: string
  /** The commit's first line. */
  title: string
  mr?: number
  status: PipelineStatus
  createdAt: number
  finishedAt?: number
  /** The image reference the package stage pushed (`image:tag`). */
  image?: string
  /** The image reference written to the deploy repo, and that commit. */
  deployedImage?: string
  deployCommit?: string
  failure?: CiFailure
  jobs: Job[]
}

export interface CiProject {
  image: string
  deploy?: { repo: string; file: string }
}

interface CiState extends Record<string, unknown> {
  pipelines: Pipeline[]
  armed: Record<string, CiFailure>
  nextPipeline: number
  nextJob: number
}

export const CI_NAME = 'gitlab-ci'
export const CI_AUTHOR = 'ravenpost-ci'
const JOBS: { name: string; stage: Stage; min: number; max: number }[] = [
  { name: 'compile', stage: 'build', min: 45, max: 90 },
  { name: 'unit-tests', stage: 'test', min: 60, max: 120 },
  { name: 'lint', stage: 'test', min: 20, max: 40 },
  { name: 'image-scan', stage: 'scan', min: 30, max: 60 },
  { name: 'push-image', stage: 'package', min: 15, max: 30 },
  { name: 'update-manifests', stage: 'update-manifests', min: 8, max: 16 },
]
/** Which job each failure fails. */
const FAILS: Record<CiFailure, string> = {
  test: 'unit-tests',
  lint: 'lint',
  scan: 'image-scan',
  push: 'push-image',
  'bad-tag': '',
}

const state = (sim: Simulator) =>
  sim.state<CiState>(CI_NAME, () => ({
    pipelines: [],
    armed: {},
    nextPipeline: 1201,
    nextJob: 8841,
  }))

export const pipelines = (sim: Simulator, project?: string): Pipeline[] =>
  state(sim).pipelines.filter((p) => project === undefined || p.project === project)
export const pipeline = (sim: Simulator, id: number) =>
  state(sim).pipelines.find((p) => p.id === id)
export const ciProject = (sim: Simulator, project: string): CiProject | undefined =>
  sim.scenario.gitops?.ci[project]

/** The next pipeline for `project` fails this way (a scenario's `ciFailure` event). */
export function armFailure(sim: Simulator, project: string, failure: CiFailure): void {
  state(sim).armed[project] = failure
}

/** Starts a pipeline for the commit `ref` points at. A failure armed for the project applies to it. */
export function startPipeline(
  sim: Simulator,
  project: string,
  opts: { ref?: string; mr?: number; failure?: CiFailure } = {},
): Pipeline {
  const st = state(sim)
  const r = repo(sim, project)
  const ref = opts.ref ?? r?.defaultBranch ?? 'main'
  const c = r && resolve(r, ref)
  if (!r || !c) throw new Error(`no commit for ${project}@${ref}`)
  const failure = opts.failure ?? st.armed[project]
  Reflect.deleteProperty(st.armed, project)
  const p: Pipeline = {
    id: st.nextPipeline++,
    project,
    ref,
    sha: c.sha,
    title: c.message.split('\n')[0] ?? '',
    ...(opts.mr !== undefined ? { mr: opts.mr } : {}),
    status: 'running',
    createdAt: sim.now,
    ...(failure ? { failure } : {}),
    jobs: JOBS.map((j) => ({
      id: st.nextJob++,
      name: j.name,
      stage: j.stage,
      status: 'created',
      durationMs: (j.min + (fnv1a32(`${project}:${c.sha}:${j.name}`) % (j.max - j.min + 1))) * 1000,
      sections: [],
    })),
  }
  st.pipelines.push(p)
  startStage(sim, p, 'build')
  return p
}

function startStage(sim: Simulator, p: Pipeline, stage: Stage): void {
  for (const j of p.jobs.filter((x) => x.stage === stage)) {
    j.status = 'running'
    j.startedAt = sim.now
    j.sections = logFor(sim, p, j, 'running')
    sim.schedule(sim.now + j.durationMs, CI_NAME, { pipeline: p.id, job: j.id })
  }
}

function finishJob(sim: Simulator, p: Pipeline, j: Job): void {
  const cfg = ciProject(sim, p.project)
  const tag = shortSha(p.sha)
  let ok = FAILS[p.failure ?? 'bad-tag'] !== j.name
  if (ok && j.name === 'push-image' && cfg) {
    pushImage(sim, cfg.image, tag, p.sha)
    p.image = `${cfg.image}:${tag}`
  }
  if (ok && j.name === 'update-manifests') ok = updateManifests(sim, p, cfg)
  j.status = ok ? 'success' : 'failed'
  j.finishedAt = sim.now
  j.sections = logFor(sim, p, j, j.status)
  const stageJobs = p.jobs.filter((x) => x.stage === j.stage)
  if (stageJobs.some((x) => x.status === 'running')) return
  const next = STAGES[STAGES.indexOf(j.stage) + 1]
  if (stageJobs.some((x) => x.status === 'failed')) {
    for (const x of p.jobs) if (x.status === 'created') x.status = 'skipped'
    p.status = 'failed'
    p.finishedAt = sim.now
  } else if (next) startStage(sim, p, next)
  else {
    p.status = 'success'
    p.finishedAt = sim.now
  }
}

/** The tag GitLab would write: `$CI_COMMIT_SHORT_SHA` (8 characters), or 7 with the bad-tag bug. */
const writtenTag = (p: Pipeline) => (p.failure === 'bad-tag' ? p.sha.slice(0, 7) : shortSha(p.sha))

function updateManifests(sim: Simulator, p: Pipeline, cfg: CiProject | undefined): boolean {
  if (!cfg?.deploy) return true
  const d = repo(sim, cfg.deploy.repo)
  const head = d && resolve(d, d.defaultBranch)
  const text = head?.files[cfg.deploy.file]
  const line = new RegExp(`(image:\\s*)${cfg.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\S+`)
  if (!d || text === undefined || !line.test(text)) return false
  const image = `${cfg.image}:${writtenTag(p)}`
  const c = commit(
    sim,
    d.name,
    d.defaultBranch,
    { [cfg.deploy.file]: text.replace(line, `$1${image}`) },
    `Deploy ${p.project} ${writtenTag(p)}\n\nPipeline #${String(p.id)}`,
    CI_AUTHOR,
  )
  p.deployedImage = image
  p.deployCommit = c.sha
  // A tag nobody pushed: the kubelet can't pull it.
  if (p.failure === 'bad-tag') setImageBehaviour(sim, image, { pull: 'notFound' })
  return true
}

/** The job log, in sections, as a GitLab runner prints it. */
function logFor(sim: Simulator, p: Pipeline, j: Job, status: JobStatus): LogSection[] {
  const cfg = ciProject(sim, p.project)
  const image = `${cfg?.image ?? `registry.example/ravenpost/${p.project}`}:${shortSha(p.sha)}`
  const sec = (id: string, title: string, lines: string[], durationMs = 1000): LogSection => ({
    id,
    title,
    lines,
    durationMs,
  })
  const sections = [
    sec(
      'prepare_executor',
      'Preparing the "kubernetes" executor',
      [
        `Running with gitlab-runner 17.5.0 (simulated)`,
        `  on ravenpost-runner-2, system ID: r_rp2`,
        `Using Kubernetes namespace: gitlab-runners`,
      ],
      3000,
    ),
    sec(
      'get_sources',
      'Getting source from Git repository',
      [
        `Fetching changes with git depth set to 20...`,
        `Initialized empty Git repository in /builds/ravenpost/${p.project}/.git/`,
        `Checking out ${shortSha(p.sha)} as detached HEAD (ref is ${p.ref})...`,
      ],
      2000,
    ),
  ]
  const failed = status === 'failed'
  const script = (lines: string[]) =>
    sec(
      'step_script',
      'Executing "step_script" stage of the job script',
      lines,
      Math.max(1000, j.durationMs - 6000),
    )
  if (status === 'running') return [...sections, script(['$ ' + firstCommand(j.name, cfg, p)])]
  switch (j.name) {
    case 'compile':
      sections.push(
        script([
          `$ npm ci`,
          `added 412 packages, and audited 413 packages in 9s`,
          `$ npm run build`,
          `> ${p.project}@1.0.0 build`,
          `> tsc -p . && vite build`,
          `✓ 214 modules transformed.`,
          `$ docker build -t ${image} .`,
          `Successfully built ${fnv1a32(image).toString(16).padStart(8, '0')}`,
          `Successfully tagged ${image}`,
        ]),
      )
      break
    case 'unit-tests':
      sections.push(
        script(
          failed
            ? [
                `$ npm test`,
                ` FAIL  src/routes/parcels.test.ts > GET /parcels/:id > returns 404 for an unknown parcel`,
                `AssertionError: expected 500 to be 404 // Object.is equality`,
                ``,
                `- Expected`,
                `+ Received`,
                ``,
                `- 404`,
                `+ 500`,
                ``,
                ` ❯ src/routes/parcels.test.ts:42:27`,
                ``,
                ` Test Files  1 failed | 23 passed (24)`,
                `      Tests  1 failed | 186 passed (187)`,
              ]
            : [
                `$ npm test`,
                ` ✓ src/routes/parcels.test.ts (12 tests)`,
                ` ✓ src/routes/tracking.test.ts (31 tests)`,
                ``,
                ` Test Files  24 passed (24)`,
                `      Tests  187 passed (187)`,
              ],
        ),
      )
      break
    case 'lint':
      sections.push(
        script(
          failed
            ? [
                `$ npm run lint`,
                `/builds/ravenpost/${p.project}/src/routes/parcels.ts`,
                `  57:9  error  'carrier' is assigned a value but never used  no-unused-vars`,
                ``,
                `✖ 1 problem (1 error, 0 warnings)`,
              ]
            : [
                `$ npm run lint`,
                `$ npx prettier --check .`,
                `All matched files use Prettier code style!`,
              ],
        ),
      )
      break
    case 'image-scan':
      sections.push(
        script([
          `$ scan-image --severity HIGH,CRITICAL --exit-code 1 ${image}`,
          `${image} (debian 12.7)`,
          failed ? `Total: 1 (HIGH: 0, CRITICAL: 1)` : `Total: 0 (HIGH: 0, CRITICAL: 0)`,
          ...(failed
            ? [
                ``,
                `LIBRARY   ADVISORY        SEVERITY  INSTALLED  FIXED`,
                `libssl3   RPSA-2026-0142  CRITICAL  3.0.13-1   3.0.15-1`,
                ``,
                `Rebuild on a patched base image (FROM ravenpost/base:12.8) to pick up the fix.`,
              ]
            : []),
        ]),
      )
      break
    case 'push-image':
      sections.push(
        script(
          failed
            ? [
                `$ docker push ${image}`,
                `The push refers to repository [${cfg?.image ?? image}]`,
                `5f70bf18a086: Preparing`,
                `denied: requested access to the resource is denied`,
              ]
            : [
                `$ docker push ${image}`,
                `The push refers to repository [${cfg?.image ?? image}]`,
                `5f70bf18a086: Pushed`,
                `${shortSha(p.sha)}: digest: sha256:${fnv1a32(image).toString(16).padStart(8, '0')}… size 1784`,
              ],
        ),
      )
      break
    default: {
      const deploy = cfg?.deploy
      const tagLine =
        p.failure === 'bad-tag'
          ? `$ export TAG=$(echo "$CI_COMMIT_SHA" | cut -c1-7)`
          : `$ export TAG="$CI_COMMIT_SHORT_SHA"`
      sections.push(
        script(
          deploy
            ? failed
              ? [
                  tagLine,
                  `$ git clone https://git.ravenpost.example/ravenpost/${deploy.repo}.git deploy`,
                  `$ grep -q "image: ${cfg.image}:" deploy/${deploy.file}`,
                  `ERROR: deploy/${deploy.file} has no "image: ${cfg.image}:…" line to update`,
                ]
              : [
                  tagLine,
                  `$ git clone https://git.ravenpost.example/ravenpost/${deploy.repo}.git deploy`,
                  `$ sed -i "s|image: ${cfg.image}:.*|image: ${cfg.image}:$TAG|" deploy/${deploy.file}`,
                  `$ git -C deploy commit -am "Deploy ${p.project} $TAG"`,
                  `[main ${(p.deployCommit ?? '').slice(0, 7)}] Deploy ${p.project} ${writtenTag(p)}`,
                  ` 1 file changed, 1 insertion(+), 1 deletion(-)`,
                  `$ git -C deploy push origin main`,
                ]
            : [`No deploy repository is configured for ${p.project}; nothing to update.`],
        ),
      )
    }
  }
  sections.push(
    sec(
      'cleanup_file_variables',
      'Cleaning up project directory and file based variables',
      [],
      1000,
    ),
  )
  sections.push(
    sec(
      'result',
      '',
      [failed ? 'ERROR: Job failed: command terminated with exit code 1' : 'Job succeeded'],
      0,
    ),
  )
  return sections
}

const firstCommand = (job: string, cfg: CiProject | undefined, p: Pipeline) =>
  ({
    compile: 'npm ci',
    'unit-tests': 'npm test',
    lint: 'npm run lint',
    'image-scan': 'scan-image …',
    'push-image': `docker push ${cfg?.image ?? p.project}:${shortSha(p.sha)}`,
  })[job] ?? 'git clone …'

/** Runs the jobs: each wakeup finishes one job and starts the next stage when its stage is done. */
export const ciController: Controller = {
  name: CI_NAME,
  reconcile: () => undefined,
  wake: (sim, payload) => {
    const w = payload as { pipeline: number; job: number }
    const p = pipeline(sim, w.pipeline)
    const j = p?.jobs.find((x) => x.id === w.job)
    if (p && j?.status === 'running') finishJob(sim, p, j)
  },
}
