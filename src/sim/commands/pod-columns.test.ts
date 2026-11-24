import { describe, expect, it } from 'vitest'
import { SimClock } from '../core/clock'
import type { ContainerStatus, Pod } from '../core/resources'
import { age, podColumns } from './pod-columns'

const clock = new SimClock('2026-01-01T00:10:00Z')
const at = (min: number) => clock.iso(min * 60_000)

function pod(
  statuses: Partial<ContainerStatus>[],
  extra: Partial<Pod['status']> = {},
  meta: Partial<Pod['metadata']> = {},
): Pod {
  return {
    apiVersion: 'v1',
    kind: 'Pod',
    metadata: { name: 'p', uid: 'u', resourceVersion: '1', creationTimestamp: at(-5), ...meta },
    spec: { containers: statuses.map((_, i) => ({ name: `c${String(i)}`, image: 'i' })) },
    status: {
      phase: 'Running',
      conditions: [{ type: 'Ready', status: 'True' }],
      containerStatuses: statuses.map((s, i) => ({
        name: `c${String(i)}`,
        image: 'i',
        imageID: 'i',
        ready: false,
        restartCount: 0,
        state: {},
        lastState: {},
        ...s,
      })),
      ...extra,
    },
  }
}

describe('podColumns (kubectl get pods)', () => {
  it('Running and ready', () => {
    expect(
      podColumns(pod([{ ready: true, state: { running: { startedAt: at(-4) } } }]), clock),
    ).toEqual({
      ready: '1/1',
      status: 'Running',
      restarts: '0',
    })
  })

  it('a waiting reason wins, and restarts show how long ago', () => {
    const p = pod([
      { ready: true, state: { running: { startedAt: at(-4) } } },
      {
        restartCount: 9,
        state: { waiting: { reason: 'CrashLoopBackOff' } },
        lastState: { terminated: { exitCode: 1, finishedAt: at(-2) } },
      },
    ])
    expect(podColumns(p, clock)).toEqual({
      ready: '1/2',
      status: 'CrashLoopBackOff',
      restarts: '9 (2m ago)',
    })
  })

  it('terminated containers show their reason, exit code or signal', () => {
    expect(
      podColumns(pod([{ state: { terminated: { exitCode: 137, reason: 'OOMKilled' } } }]), clock)
        .status,
    ).toBe('OOMKilled')
    expect(podColumns(pod([{ state: { terminated: { exitCode: 2 } } }]), clock).status).toBe(
      'ExitCode:2',
    )
    expect(
      podColumns(pod([{ state: { terminated: { exitCode: 0, signal: 9 } } }]), clock).status,
    ).toBe('Signal:9')
  })

  it('Completed with a container still running reads Running or NotReady', () => {
    const statuses: Partial<ContainerStatus>[] = [
      { ready: true, state: { running: { startedAt: at(-4) } } },
      { state: { terminated: { exitCode: 0, reason: 'Completed' } } },
    ]
    expect(podColumns(pod(statuses), clock).status).toBe('Running')
    expect(podColumns(pod(statuses, { conditions: [] }), clock).status).toBe('NotReady')
  })

  it('pod reason, phase, Terminating and Unknown', () => {
    expect(podColumns(pod([], { phase: 'Pending' }), clock)).toEqual({
      ready: '0/0',
      status: 'Pending',
      restarts: '0',
    })
    expect(podColumns(pod([], { reason: 'Evicted', phase: 'Failed' }), clock).status).toBe(
      'Evicted',
    )
    expect(podColumns(pod([{}], {}, { deletionTimestamp: at(0) }), clock).status).toBe(
      'Terminating',
    )
    expect(
      podColumns(pod([{}], { reason: 'NodeLost' }, { deletionTimestamp: at(0) }), clock).status,
    ).toBe('Unknown')
  })

  it('AGE from the sim clock', () => {
    expect(age(at(-5), clock)).toBe('5m')
    expect(age(at(-60 * 26), clock)).toBe('26h')
  })
})
