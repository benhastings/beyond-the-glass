import { parseDuration } from '../../core/duration.ts'
import type { Resource } from '../../core/resources.ts'
import type { Simulator } from '../../core/simulator.ts'
import {
  application,
  applications,
  desiredManifests,
  refresh,
  sync,
  type Application,
} from '../../gitops/argo.ts'
import { applyObject, LAST_APPLIED } from '../kubectl/manifests.ts'
import { kubectlYaml } from '../kubectl/get.ts'
import { bool, str } from '../flags.ts'
import { goTabwriter } from '../format.ts'
import { defineCommand, fail, ok, type Output } from '../types.ts'
import { normalDiff } from '../unified-diff.ts'

/** Where Argo CD's API "is" in this world, for `argocd login` and app URLs. */
export const ARGOCD_HOST = 'argocd.ravenpost.example'
export const repoURL = (name: string) => `https://git.ravenpost.example/ravenpost/${name}.git`

const fatal = (msg: string) => fail(`FATA[0000] ${msg}`, 20)
const notFound = (name: string) =>
  fatal(`rpc error: code = NotFound desc = applications.argoproj.io "${name}" not found`)

const server = (sim: Simulator, cluster: string) =>
  sim.scenario.clusters.find((c) => c.name === cluster)?.server ?? cluster
const policy = (a: Application) => {
  const auto = a.syncPolicy?.automated
  if (!auto) return { short: '<none>', long: 'Manual' }
  return {
    short: auto.prune ? 'Auto-Prune' : 'Auto',
    long: `Automated${auto.prune ? ' (Prune)' : ''}`,
  }
}
const iso = (sim: Simulator, t: number) =>
  new Date(sim.clock.epochMs + t).toISOString().replace('.000Z', '+00:00')
const group = (kind: string) => (kind === 'Deployment' || kind === 'ReplicaSet' ? 'apps' : '')

/** The Application as the API returns it (`-o yaml|json`). */
function apiObject(sim: Simulator, a: Application) {
  return {
    apiVersion: 'argoproj.io/v1alpha1',
    kind: 'Application',
    metadata: { name: a.name, namespace: 'argocd' },
    spec: {
      project: a.project ?? 'default',
      source: {
        repoURL: repoURL(a.source.repo),
        path: a.source.path,
        targetRevision: a.source.targetRevision,
      },
      destination: {
        server: server(sim, a.destination.cluster),
        namespace: a.destination.namespace,
      },
      ...(a.syncPolicy ? { syncPolicy: a.syncPolicy } : {}),
    },
    status: {
      sync: { status: a.status.sync, revision: a.status.revision },
      health: { status: a.status.health },
      resources: a.status.resources.map((r) => ({
        group: group(r.kind) || undefined,
        version: 'v1',
        kind: r.kind,
        namespace: r.namespace,
        name: r.name,
        status: r.status,
        ...(r.health
          ? {
              health: {
                status: r.health,
                ...(r.healthMessage ? { message: r.healthMessage } : {}),
              },
            }
          : {}),
      })),
      history: a.status.history.map((h) => ({
        id: h.id,
        revision: h.revision,
        deployedAt: iso(sim, h.deployedAt),
      })),
      ...(a.status.operationState
        ? {
            operationState: {
              phase: a.status.operationState.phase,
              message: a.status.operationState.message,
              syncResult: { revision: a.status.operationState.revision },
            },
          }
        : {}),
      reconciledAt: iso(sim, a.status.reconciledAt),
    },
  }
}

function resourceTable(a: Application, messages: Record<string, string> = {}): string {
  const rows = a.status.resources.map(
    (r) =>
      `${group(r.kind)}\t${r.kind}\t${r.namespace}\t${r.name}\t${r.status}\t${r.health ?? ''}\t\t${messages[`${r.kind}/${r.name}`] ?? r.healthMessage ?? ''}`,
  )
  return goTabwriter(['GROUP\tKIND\tNAMESPACE\tNAME\tSTATUS\tHEALTH\tHOOK\tMESSAGE', ...rows])
}

/** `argocd app get`'s summary block. */
function summary(sim: Simulator, a: Application): string {
  const lines = [
    `Name:\targocd/${a.name}`,
    `Project:\t${a.project ?? 'default'}`,
    `Server:\t${server(sim, a.destination.cluster)}`,
    `Namespace:\t${a.destination.namespace}`,
    `URL:\thttps://${ARGOCD_HOST}/applications/${a.name}`,
    'Source:',
    `- Repo:\t${repoURL(a.source.repo)}`,
    `  Target:\t${a.source.targetRevision}`,
    `  Path:\t${a.source.path}`,
    'SyncWindow:\tSync Allowed',
    `Sync Policy:\t${policy(a).long}`,
    `Sync Status:\t${a.status.sync}${a.status.revision ? ` ${a.status.sync === 'Synced' ? 'to' : 'from'} ${a.source.targetRevision} (${a.status.revision.slice(0, 7)})` : ''}`,
    `Health Status:\t${a.status.health}`,
  ]
  const out = [
    goTabwriter(
      lines.map((l) => (l.includes('\t') ? l : `${l}\t`)),
      2,
    ).replace(/\s+$/gm, ''),
  ]
  if (a.status.conditions.length)
    out.push(
      '',
      goTabwriter([
        'CONDITION\tMESSAGE',
        ...a.status.conditions.map((c) => `ComparisonError\t${c}`),
      ]),
    )
  return out.join('\n')
}

function operationBlock(sim: Simulator, a: Application): string {
  const op = a.status.operationState
  if (!op) return ''
  return goTabwriter([
    'Operation:\tSync',
    `Sync Revision:\t${op.revision}`,
    `Phase:\t${op.phase}`,
    `Start:\t${iso(sim, op.startedAt)}`,
    `Finished:\t${iso(sim, op.finishedAt)}`,
    `Duration:\t${String(Math.round((op.finishedAt - op.startedAt) / 1000))}s`,
    `Message:\t${op.message}`,
  ])
}

/** `argocd app diff`: live versus desired, per resource, in `diff`'s classic format. */
function diff(sim: Simulator, a: Application, revision?: string): Output {
  const cluster = sim.clusterByName(a.destination.cluster)
  const d = desiredManifests(sim, a, revision)
  if (!cluster || d.error)
    return fatal(`rpc error: code = Unknown desc = ${d.error ?? 'no cluster'}`)
  const view = (o: Resource | undefined) => {
    if (!o) return ''
    const rest: Record<string, unknown> & { metadata: Resource['metadata'] } = { ...o }
    delete rest.status
    const meta = { ...rest.metadata }
    for (const k of [
      'uid',
      'resourceVersion',
      'creationTimestamp',
      'generation',
      'managedFields',
    ] as const)
      Reflect.deleteProperty(meta, k)
    // Like argocd, leave out the last-applied record: it repeats the whole object on one line.
    if (meta.annotations) {
      const annotations = Object.fromEntries(
        Object.entries(meta.annotations).filter(([k]) => k !== LAST_APPLIED),
      )
      if (Object.keys(annotations).length) meta.annotations = annotations
      else delete meta.annotations
    }
    return `${kubectlYaml({ ...rest, metadata: meta })}\n`
  }
  const out: string[] = []
  for (const doc of d.docs) {
    const res = applyObject(sim, cluster, doc, {
      source: a.name,
      namespace: a.destination.namespace,
      namespaceFlag: false,
      dryRun: true,
      verb: 'apply',
    })
    if (!res.ok || res.action === 'unchanged') continue
    const changes = normalDiff(view(res.before), view(res.after))
    if (changes)
      out.push(
        `===== ${group(res.kind)}/${res.kind} ${a.destination.namespace}/${res.name} ======`,
        changes,
      )
  }
  return out.length ? { stdout: out.join('\n'), stderr: '', exitCode: 1 } : ok('')
}

const HELP = `argocd controls an Argo CD server

Usage:
  argocd app list
  argocd app get APPNAME [-o yaml|json|wide] [--refresh]
  argocd app diff APPNAME [--revision REV]
  argocd app sync APPNAME [--prune]
  argocd app history APPNAME
  argocd app rollback APPNAME [ID]
  argocd app wait APPNAME [--health] [--sync] [--timeout SECONDS]
  argocd app refresh APPNAME
  argocd login ${ARGOCD_HOST}

Here, you're already logged in to ${ARGOCD_HOST}.`

const SUBCOMMANDS = [
  'list',
  'get',
  'diff',
  'sync',
  'history',
  'rollback',
  'wait',
  'refresh',
] as const

/** `argocd` (E7-04): the app subcommands an operator uses, over the simulated Argo CD (E7-01). */
export const argocdCommand = defineCommand({
  path: ['argocd'],
  summary: 'Argo CD: list, inspect, diff, sync and roll back applications',
  usage: 'argocd app list|get|diff|sync|history|rollback|wait|refresh [APPNAME]',
  flags: [
    {
      name: 'output',
      short: 'o',
      type: 'string',
      description: 'yaml, json or wide',
      values: ['yaml', 'json', 'wide', 'name'],
    },
    { name: 'refresh', type: 'bool', description: 'get: refresh first' },
    { name: 'revision', type: 'string', description: 'diff: compare with this revision' },
    { name: 'prune', type: 'bool', description: 'sync: delete what Git no longer has' },
    { name: 'health', type: 'bool', description: 'wait: until healthy' },
    { name: 'sync', type: 'bool', description: 'wait: until synced' },
    { name: 'timeout', type: 'string', description: 'wait: give up after this many seconds' },
  ],
  help: () => HELP,
  run: (ctx, inv): Output => {
    const sim = ctx.sim
    const [group0, sub, name, extra] = inv.args
    if (group0 === 'login')
      return ok(
        `'admin:login' logged in successfully\nContext '${ARGOCD_HOST}' updated\n\n(You were already logged in: this terminal's argocd always talks to ${ARGOCD_HOST}.)`,
      )
    if (group0 === 'version')
      return ok('argocd: v2.13.0+simulated\nargocd-server: v2.13.0+simulated')
    if (group0 !== 'app')
      return fatal(
        group0 ? `unknown command "${group0}" for "argocd"\nRun 'argocd --help' for usage.` : HELP,
      )
    if (!sub || !(SUBCOMMANDS as readonly string[]).includes(sub))
      return fatal(
        sub
          ? `unknown command "${sub}" for "argocd app"`
          : `argocd app needs a subcommand: ${SUBCOMMANDS.join(', ')}`,
      )
    const output = str(inv.flags, 'output')
    if (sub === 'list') {
      const apps = applications(sim).map((a) => refresh(sim, a.name) ?? a)
      if (output === 'json' || output === 'yaml') {
        const items = apps.map((a) => apiObject(sim, a))
        return ok(output === 'json' ? JSON.stringify(items, null, 2) : kubectlYaml(items))
      }
      if (output === 'name') return ok(apps.map((a) => `argocd/${a.name}`).join('\n'))
      const rows = apps.map(
        (a) =>
          `argocd/${a.name}\t${server(sim, a.destination.cluster)}\t${a.destination.namespace}\t${a.project ?? 'default'}\t${a.status.sync}\t${a.status.health}\t${policy(a).short}\t${a.status.conditions.length ? 'ComparisonError' : '<none>'}\t${repoURL(a.source.repo)}\t${a.source.path}\t${a.source.targetRevision}`,
      )
      return ok(
        goTabwriter([
          'NAME\tCLUSTER\tNAMESPACE\tPROJECT\tSTATUS\tHEALTH\tSYNCPOLICY\tCONDITIONS\tREPO\tPATH\tTARGET',
          ...rows,
        ]),
      )
    }
    if (!name)
      return fatal(`argocd app ${sub} needs an application name: argocd app ${sub} APPNAME`)
    const app = application(sim, name)
    if (!app) return notFound(name)
    switch (sub) {
      case 'get':
      case 'refresh': {
        const a = refresh(sim, name) ?? app
        if (output === 'json') return ok(JSON.stringify(apiObject(sim, a), null, 2))
        if (output === 'yaml') return ok(kubectlYaml(apiObject(sim, a)))
        return ok(`${summary(sim, a)}\n\n${resourceTable(a)}`)
      }
      case 'diff':
        return diff(sim, app, str(inv.flags, 'revision'))
      case 'history': {
        const rows = app.status.history.map(
          (h) =>
            `${String(h.id)}\t${iso(sim, h.deployedAt).replace('T', ' ').replace('+00:00', ' +0000 UTC')}\t${app.source.targetRevision} (${h.revision.slice(0, 7)})`,
        )
        return ok(
          `SOURCE  ${repoURL(app.source.repo)}\n${goTabwriter(['ID\tDATE\tREVISION', ...rows])}`,
        )
      }
      case 'sync':
      case 'rollback': {
        let revision: string | undefined
        if (sub === 'rollback') {
          if (app.syncPolicy?.automated)
            return fatal(
              'rpc error: code = FailedPrecondition desc = rollback cannot be initiated when auto-sync is enabled',
            )
          const id = extra === undefined ? app.status.history.length - 2 : Number(extra)
          const h = app.status.history.find((x) => x.id === id)
          if (!h)
            return fatal(
              `rpc error: code = InvalidArgument desc = application ${name} does not have history with id ${String(extra ?? id)}`,
            )
          revision = h.revision
        }
        const a =
          sync(sim, name, {
            ...(bool(inv.flags, 'prune') ? { prune: true } : {}),
            ...(revision ? { revision } : {}),
          }) ?? app
        const op = a.status.operationState
        const stamp = iso(sim, op?.finishedAt ?? sim.now)
        const rows = a.status.resources.map(
          (r) =>
            `${stamp}\t${group(r.kind)}\t${r.kind}\t${r.namespace}\t${r.name}\t${r.status}\t${r.health ?? ''}\t\t`,
        )
        const body = `${goTabwriter(['TIMESTAMP\tGROUP\tKIND\tNAMESPACE\tNAME\tSTATUS\tHEALTH\tHOOK\tMESSAGE', ...rows])}\n\n${summary(sim, a)}\n${operationBlock(sim, a)}\n\n${resourceTable(a)}`
        return op?.phase === 'Failed'
          ? {
              stdout: body,
              stderr: `FATA[0000] Operation has completed with phase: Failed`,
              exitCode: 20,
            }
          : ok(body)
      }
      case 'wait': {
        const timeoutText = str(inv.flags, 'timeout')
        const limit = timeoutText
          ? parseDuration(/^\d+$/.test(timeoutText) ? `${timeoutText}s` : timeoutText)
          : 10 * 60_000
        const wantHealth = bool(inv.flags, 'health') || !bool(inv.flags, 'sync')
        const wantSync = bool(inv.flags, 'sync') || !bool(inv.flags, 'health')
        const start = sim.now
        for (;;) {
          const a = refresh(sim, name) ?? app
          const done =
            (!wantHealth || a.status.health === 'Healthy') &&
            (!wantSync || a.status.sync === 'Synced')
          if (done) return ok(`${summary(sim, a)}\n\n${resourceTable(a)}`)
          if (a.status.health === 'Degraded' && wantHealth)
            return fatal(
              `application '${name}' health state has transitioned from Progressing to Degraded`,
            )
          if (sim.now - start >= limit)
            return fatal(
              `timed out (${String(Math.round(limit / 1000))}s) waiting for app "${name}" match desired state`,
            )
          sim.advance(Math.min(5000, start + limit - sim.now))
          sim.reconcile()
        }
      }
      default:
        return fatal(`unknown command "${sub}" for "argocd app"`)
    }
  },
  complete: (ctx, words, partial) => {
    const pos = words.filter((w) => !w.startsWith('-'))
    if (pos.length === 0) return ['app', 'login', 'version'].filter((x) => x.startsWith(partial))
    if (pos.length === 1 && pos[0] === 'app')
      return SUBCOMMANDS.filter((x) => x.startsWith(partial))
    if (pos.length === 2 && pos[0] === 'app')
      return applications(ctx.sim)
        .map((a) => a.name)
        .filter((n) => n.startsWith(partial))
    return []
  },
})
