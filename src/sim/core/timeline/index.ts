import type { TimelineEventDef } from './define.ts'
import { deleteConfigKey } from './delete-config-key.ts'
import { setImage } from './set-image.ts'
import { setMemoryLimit } from './set-memory-limit.ts'
import { injectLatency, load } from './traffic.ts'

/** Every timeline event type. To add one: a new file in this folder, plus one line here. */
export const TIMELINE_EVENTS: readonly TimelineEventDef<never>[] = [
  setImage,
  deleteConfigKey,
  setMemoryLimit,
  injectLatency,
  load,
] as unknown as readonly TimelineEventDef<never>[]

export function timelineEvent(type: string): TimelineEventDef<never> | undefined {
  return TIMELINE_EVENTS.find((e) => e.type === type)
}

export {
  defineTimelineEvent,
  timelineParams,
  type TimelineEventDef,
  type Problem,
} from './define.ts'
