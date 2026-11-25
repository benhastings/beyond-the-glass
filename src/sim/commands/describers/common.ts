import type { Cluster } from '../../core/cluster.ts'
import type { SimClock } from '../../core/clock.ts'
import type { Container, Labels, ObjectReference } from '../../core/resources.ts'
import { humanDuration } from '../format.ts'

export interface DescribeContext {
  cluster: Cluster
  clock: SimClock
}

/** Builds describe output: lines of tab-separated cells, run through Go's tabwriter at the end. */
export class Lines {
  readonly out: string[] = []
  /** `Key:\tvalue` at an indent (two spaces per level). */
  kv(key: string, value: string, level = 0): this {
    this.out.push(`${'  '.repeat(level)}${key}:\t${value}`)
    return this
  }
  /** A heading with nothing after it (`Containers:`). */
  head(key: string, level = 0): this {
    this.out.push(`${'  '.repeat(level)}${key}:`)
    return this
  }
  raw(line: string): this {
    this.out.push(line)
    return this
  }
  /** `Labels:  a=b` then further labels aligned under the first, as kubectl prints maps. */
  map(key: string, m: Labels | undefined, level = 0, sep = '='): this {
    const entries = Object.entries(m ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))
    if (!entries.length) return this.kv(key, '<none>', level)
    entries.forEach(([k, v], i) => {
      this.out.push(`${i === 0 ? `${'  '.repeat(level)}${key}:` : ''}\t${k}${sep}${v}`)
    })
    return this
  }
}

/** The Events section of describe output, for one object. */
export function eventsSection(
  lines: Lines,
  ctx: DescribeContext,
  ref: Pick<ObjectReference, 'kind' | 'name'> & { uid?: string; namespace?: string },
) {
  const events = ctx.cluster
    .list('Event', ref.namespace ? { namespace: ref.namespace } : {})
    .filter(
      (e) =>
        e.involvedObject.kind === ref.kind &&
        e.involvedObject.name === ref.name &&
        (!ref.uid || !e.involvedObject.uid || e.involvedObject.uid === ref.uid),
    )
    .sort((a, b) =>
      a.lastTimestamp < b.lastTimestamp ? -1 : a.lastTimestamp > b.lastTimestamp ? 1 : 0,
    )
  if (!events.length) return lines.kv('Events', '<none>')
  const ago = (iso: string) => humanDuration(ctx.clock.now - (Date.parse(iso) - ctx.clock.epochMs))
  lines.head('Events')
  lines.raw('  Type\tReason\tAge\tFrom\tMessage')
  lines.raw('  ----\t------\t----\t----\t-------')
  for (const e of events) {
    const age =
      e.count > 1
        ? `${ago(e.lastTimestamp)} (x${String(e.count)} over ${ago(e.firstTimestamp)})`
        : ago(e.lastTimestamp)
    lines.raw(`  ${e.type}\t${e.reason}\t${age}\t${e.source.component}\t${e.message}`)
  }
  return lines
}

const probeText = (p: NonNullable<Container['readinessProbe']>) => {
  const how = p.httpGet
    ? `http-get http://:${String(p.httpGet.port)}${p.httpGet.path}`
    : p.tcpSocket
      ? `tcp-socket :${String(p.tcpSocket.port)}`
      : `exec [${(p.exec?.command ?? []).join(' ')}]`
  return `${how} delay=${String(p.initialDelaySeconds ?? 0)}s timeout=${String(p.timeoutSeconds ?? 1)}s period=${String(p.periodSeconds ?? 10)}s #success=${String(p.successThreshold ?? 1)} #failure=${String(p.failureThreshold ?? 3)}`
}

/** A container's spec lines (shared by pod and deployment describe). */
export function containerSpec(
  lines: Lines,
  c: Container,
  level: number,
  withMounts: string | undefined,
) {
  const port = c.ports?.[0]
  lines.kv(
    'Port',
    port ? `${String(port.containerPort)}/${port.protocol ?? 'TCP'}` : '<none>',
    level,
  )
  lines.kv('Host Port', port ? `0/${port.protocol ?? 'TCP'}` : '<none>', level)
  for (const k of ['limits', 'requests'] as const) {
    const r = c.resources?.[k]
    if (r && Object.keys(r).length) {
      lines.head(k === 'limits' ? 'Limits' : 'Requests', level)
      for (const [name, v] of Object.entries(r)) lines.kv(name, v, level + 1)
    }
  }
  if (c.livenessProbe) lines.kv('Liveness', probeText(c.livenessProbe), level)
  if (c.readinessProbe) lines.kv('Readiness', probeText(c.readinessProbe), level)
  const envFrom = c.envFrom ?? []
  if (envFrom.length) {
    lines.head('Environment Variables from', level)
    for (const f of envFrom) {
      if (f.configMapRef)
        lines.raw(`${'  '.repeat(level + 1)}${f.configMapRef.name}\tConfigMap\tOptional: false`)
      if (f.secretRef)
        lines.raw(`${'  '.repeat(level + 1)}${f.secretRef.name}\tSecret\tOptional: false`)
    }
  }
  const env = c.env ?? []
  if (!env.length) lines.kv('Environment', '<none>', level)
  else {
    lines.head('Environment', level)
    for (const e of env) {
      const cm = e.valueFrom?.configMapKeyRef
      const sec = e.valueFrom?.secretKeyRef
      const v = cm
        ? `<set to the key '${cm.key}' of config map '${cm.name}'>\tOptional: ${String(cm.optional ?? false)}`
        : sec
          ? `<set to the key '${sec.key}' in secret '${sec.name}'>\tOptional: ${String(sec.optional ?? false)}`
          : (e.value ?? '')
      lines.kv(e.name, v, level + 1)
    }
  }
  if (withMounts) {
    lines.head('Mounts', level)
    lines.raw(
      `${'  '.repeat(level + 1)}/var/run/secrets/kubernetes.io/serviceaccount from ${withMounts} (ro)`,
    )
  } else lines.kv('Mounts', '<none>', level)
}
