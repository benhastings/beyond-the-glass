import { rollbackDeployment } from '../../controllers/deployment.ts'
import { parseDuration } from '../../core/duration.ts'
import type { Deployment, ReplicaSet } from '../../core/resources.ts'
import { ownedReplicaSets } from '../../core/workloads.ts'
import { containerSpec, Lines } from '../describers/common.ts'
import { str } from '../flags.ts'
import { goTabwriter } from '../format.ts'
import {
  defineCommand,
  fail,
  ok,
  type CommandContext,
  type Invocation,
  type Output,
} from '../types.ts'
import { target, type Target } from './globals.ts'
import { mutated, notFound, parseRefs, slashName } from './objects.ts'

const REVISION = 'deployment.kubernetes.io/revision'
const CHANGE_CAUSE = 'kubernetes.io/change-cause'
const RESTARTED_AT = 'kubectl.kubernetes.io/restartedAt'
/** If `rollout status` has no --timeout and the rollout never ends, stop after this much sim time. */
export const STATUS_LIMIT_MS = 20 * 60_000
const SUBCOMMANDS = ['status', 'history', 'undo', 'restart', 'pause', 'resume'] as const

const HELP = `Manage the rollout of one or many resources.

Available Commands:
  history       View rollout history
  pause         Mark the provided resource as paused
  restart       Restart a resource
  resume        Resume a paused resource
  status        Show the status of the rollout
  undo          Undo a previous rollout

Examples:
  # Watch a rollout until it finishes (the simulation's clock moves while you wait)
  kubectl rollout status deployment/ravenpost-api -n ravenpost

  # See the revisions, then go back to the previous one
  kubectl rollout history deployment/ravenpost-api -n ravenpost
  kubectl rollout undo deployment/ravenpost-api -n ravenpost

  # Replace every pod, one at a time, without changing the template
  kubectl rollout restart deployment/ravenpost-api -n ravenpost

Usage:
  kubectl rollout SUBCOMMAND (TYPE NAME | TYPE/NAME) [options]`

const revisionOf = (rs: ReplicaSet) => Number(rs.metadata.annotations?.[REVISION] ?? 0)

/** One line of `rollout status`, and whether the rollout is over (kubectl's DeploymentStatusViewer). */
function statusLine(d: Deployment): { line: string; done: boolean; error?: string } {
  const name = d.metadata.name
  const st = d.status
  const total = st.replicas ?? 0
  if ((d.metadata.generation ?? 1) > (st.observedGeneration ?? 0))
    return { line: 'Waiting for deployment spec update to be observed...', done: false }
  const progressing = st.conditions?.find((c) => c.type === 'Progressing')
  if (progressing?.reason === 'ProgressDeadlineExceeded')
    return {
      line: '',
      done: true,
      error: `error: deployment "${name}" exceeded its progress deadline`,
    }
  const updated = st.updatedReplicas ?? 0
  const available = st.availableReplicas ?? 0
  if (updated < d.spec.replicas)
    return {
      line: `Waiting for deployment "${name}" rollout to finish: ${String(updated)} out of ${String(d.spec.replicas)} new replicas have been updated...`,
      done: false,
    }
  if (total > updated)
    return {
      line: `Waiting for deployment "${name}" rollout to finish: ${String(total - updated)} old replicas are pending termination...`,
      done: false,
    }
  if (available < updated)
    return {
      line: `Waiting for deployment "${name}" rollout to finish: ${String(available)} of ${String(updated)} updated replicas are available...`,
      done: false,
    }
  return { line: `deployment "${name}" successfully rolled out`, done: true }
}

function status(ctx: CommandContext, inv: Invocation, t: Target, d: Deployment): Output {
  const sim = ctx.sim
  const timeoutText = str(inv.flags, 'timeout')
  let timeout = STATUS_LIMIT_MS
  if (timeoutText !== undefined && timeoutText !== '0' && timeoutText !== '0s') {
    try {
      timeout = parseDuration(timeoutText)
    } catch {
      return fail(
        `error: invalid argument "${timeoutText}" for "--timeout" flag: time: invalid duration "${timeoutText}"`,
      )
    }
  }
  const watch = str(inv.flags, 'watch') !== 'false'
  const out: string[] = []
  const deadline = sim.now + timeout
  for (;;) {
    const live = t.cluster.get('Deployment', t.namespace, d.metadata.name)
    if (!live)
      return {
        stdout: out.join('\n'),
        stderr: notFound({ plural: 'deployments' } as never, d.metadata.name),
        exitCode: 1,
      }
    const s = statusLine(live)
    if (s.error) return { stdout: out.join('\n'), stderr: s.error, exitCode: 1 }
    if (s.line && out.at(-1) !== s.line) out.push(s.line)
    if (s.done || !watch) return ok(out.join('\n'))
    if (sim.now >= deadline)
      return {
        stdout: out.join('\n'),
        stderr: 'error: timed out waiting for the condition',
        exitCode: 1,
      }
    sim.advance(Math.min(1000, deadline - sim.now))
    sim.reconcile()
  }
}

function podTemplate(rs: ReplicaSet): string {
  const l = new Lines()
  const tpl = rs.spec.template
  const labels = Object.fromEntries(Object.entries(tpl.metadata.labels ?? {}))
  l.head('Pod Template')
  l.map('Labels', labels, 1)
  if (Object.keys(tpl.metadata.annotations ?? {}).length)
    l.map('Annotations', tpl.metadata.annotations, 1, ': ')
  l.head('Containers', 1)
  for (const c of tpl.spec.containers) {
    l.raw(`   ${c.name}:`)
    l.raw(`    Image:\t${c.image}`)
    const spec = new Lines()
    containerSpec(spec, c, 2, undefined)
    for (const line of spec.out) l.raw(line)
  }
  l.kv('Volumes', '<none>', 1).kv('Node-Selectors', '<none>', 1).kv('Tolerations', '<none>', 1)
  return goTabwriter(l.out)
}

function history(inv: Invocation, t: Target, d: Deployment): Output {
  const sets = ownedReplicaSets(t.cluster, d).sort((a, b) => revisionOf(a) - revisionOf(b))
  const name = slashName(
    { plural: 'deployments', singular: 'deployment' } as never,
    d.metadata.name,
  )
  const revText = str(inv.flags, 'revision')
  if (revText !== undefined && revText !== '0') {
    const rs = sets.find((x) => revisionOf(x) === Number(revText))
    if (!rs) return fail(`error: unable to find the specified revision`)
    return ok(`${name} with revision #${revText}\n${podTemplate(rs)}`)
  }
  const rows = sets.map(
    (rs) => `${String(revisionOf(rs))}\t${rs.metadata.annotations?.[CHANGE_CAUSE] ?? '<none>'}`,
  )
  return ok(`${name} \n${goTabwriter(['REVISION\tCHANGE-CAUSE', ...rows])}\n`)
}

/** `kubectl rollout status|history|undo|restart|pause|resume` for Deployments (E6-07). */
export const kubectlRollout = defineCommand({
  path: ['kubectl', 'rollout'],
  summary: 'Watch, inspect, undo or restart a Deployment rollout',
  usage: 'kubectl rollout status|history|undo|restart|pause|resume deployment/NAME [-n NS]',
  flags: [
    { name: 'timeout', type: 'string', description: 'status: give up after this long, e.g. 2m' },
    { name: 'watch', short: 'w', type: 'string', description: 'status: false to check once' },
    { name: 'revision', type: 'string', description: 'history: show one revision in detail' },
    { name: 'to-revision', type: 'string', description: 'undo: the revision to go back to' },
  ],
  help: () => HELP,
  run: (ctx, inv) => {
    const [sub, ...rest] = inv.args
    if (!sub) return fail(`${HELP}\n\nerror: specify a subcommand: ${SUBCOMMANDS.join(', ')}`)
    if (!(SUBCOMMANDS as readonly string[]).includes(sub))
      return fail(
        `error: unknown command "${sub}" for "kubectl rollout"\n\nAvailable Commands: ${SUBCOMMANDS.join(', ')}`,
      )
    const t = target(ctx, inv.flags)
    if (!t.ok) return fail(t.error)
    const parsed = parseRefs(rest)
    if ('error' in parsed) return fail(parsed.error)
    const ref = parsed.refs[0]
    if (!ref || !ref.name)
      return fail(
        `error: required resource not specified\nSee 'kubectl rollout ${sub} -h' for help and examples`,
      )
    if (ref.type.kind !== 'Deployment')
      return fail(
        `error: no ${sub === 'status' ? 'status viewer' : sub === 'history' ? 'history viewer' : sub === 'undo' ? 'rollbacker' : 'restarter'} has been implemented for ${ref.type.kind === 'Pod' ? '"Pod"' : `"${ref.type.kind}"`}${['StatefulSet', 'DaemonSet'].includes(ref.type.kind) ? ' in this simulator' : ''}`,
      )
    const d = t.target.cluster.get('Deployment', t.target.namespace, ref.name)
    if (!d) return fail(notFound(ref.type, ref.name))
    const name = slashName(ref.type, d.metadata.name)
    const record = (verb: string, detail?: Record<string, unknown>) => {
      mutated(ctx, inv, t.target, {
        verb,
        kind: 'Deployment',
        name: d.metadata.name,
        ...(detail ? { detail } : {}),
      })
    }
    switch (sub) {
      case 'status':
        return status(ctx, inv, t.target, d)
      case 'history':
        return history(inv, t.target, d)
      case 'undo': {
        const toText = str(inv.flags, 'to-revision')
        const to = toText !== undefined && toText !== '0' ? Number(toText) : undefined
        if (to !== undefined && !Number.isInteger(to))
          return fail(
            `error: invalid argument "${toText ?? ''}" for "--to-revision" flag: strconv.ParseInt: parsing "${toText ?? ''}": invalid syntax`,
          )
        const current = Number(d.metadata.annotations?.[REVISION] ?? 0)
        if (to === current)
          return ok(
            `${name} skipped rollback (current template already matches revision ${String(to)})`,
          )
        const r = rollbackDeployment(ctx.sim, t.target.cluster, d, to)
        if ('error' in r) return fail(r.error)
        record('rollout-undo', { toRevision: r.revision })
        return ok(`${name} rolled back`)
      }
      case 'restart': {
        if (d.spec.paused)
          return fail(
            `error: deployments.apps "${d.metadata.name}" can't restart paused deployment (run rollout resume first)`,
          )
        const tpl = d.spec.template
        tpl.metadata.annotations = {
          ...tpl.metadata.annotations,
          [RESTARTED_AT]: ctx.sim.clock.iso(),
        }
        d.metadata.generation = (d.metadata.generation ?? 1) + 1
        t.target.cluster.put(d)
        record('rollout-restart')
        return ok(`${name} restarted`)
      }
      default: {
        const pause = sub === 'pause'
        if (Boolean(d.spec.paused) === pause)
          return fail(
            `error: deployments.apps "${d.metadata.name}" is ${pause ? 'already paused' : 'not paused'}`,
          )
        d.spec.paused = pause
        d.metadata.generation = (d.metadata.generation ?? 1) + 1
        t.target.cluster.put(d)
        record(`rollout-${sub}`)
        return ok(`${name} ${pause ? 'paused' : 'resumed'}`)
      }
    }
  },
  complete: (ctx, words, partial) => {
    const positional = words.filter((w) => !w.startsWith('-'))
    if (positional.length === 0) return SUBCOMMANDS.filter((s) => s.startsWith(partial))
    if (positional.length === 1)
      return ctx.sim
        .cluster()
        .list('Deployment', { namespace: ctx.sim.namespace() })
        .map((d) => `deployment/${d.metadata.name}`)
        .filter((n) => n.startsWith(partial))
    return []
  },
})
