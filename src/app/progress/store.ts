import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  actions,
  debouncedStore,
  emptyProgress,
  progressV1,
  PROGRESS_KEY,
  CURRENT_VERSION,
  type Answer,
  type ChallengeProgress,
  type DebouncedStore,
  type Depth,
  type KeyValueStore,
  type Level,
  type Progress,
  type ScenarioProgress,
  type Settings,
  type StorageFailure,
} from '@/progress'

export interface ProgressState {
  progress: Progress
  /** Set when a save failed; the StorageNotice shows it until dismissed. */
  storageFailure: StorageFailure['kind'] | undefined
  /** True when stored progress existed but didn't validate (E3-02 recovers it). */
  loadFailed: boolean
  dismissStorageFailure: () => void
  setDisplayName: (name: string | undefined) => void
  recordThresholdAnswer: (questionId: string, value: Answer) => void
  completeThreshold: (placement: Record<string, Level>) => void
  overrideLevel: (domain: string, value: Level | undefined) => void
  chooseStartRegion: (region: string | undefined) => void
  goToStep: (lessonId: string, step: number) => void
  completeStep: (lessonId: string, stepId: string) => void
  completeLesson: (lessonId: string) => void
  setDepth: (lessonId: string, value: Depth) => void
  recordCheckAttempt: (checkId: string, value: Answer, passed: boolean) => void
  updateChallenge: (
    challengeId: string,
    patch: Partial<Omit<ChallengeProgress, 'completedAt'>>,
  ) => void
  saveScenario: (scenarioId: string, patch: ScenarioProgress) => void
  updateSettings: (patch: Partial<Omit<Settings, 'updatedAt'>>) => void
  /** Starts over with empty progress. */
  reset: () => void
}

export type ProgressStore = UseBoundStore<StoreApi<ProgressState>> & { storage: DebouncedStore }

export interface StoreOptions {
  /** Where progress is kept (default: localStorage). */
  backing: KeyValueStore
  /** The current time (default: the real clock). */
  now?: () => string
  /** Write interval (default 500 ms). */
  intervalMs?: number
}

/**
 * Creates the progress store: Zustand with the persist middleware under `btg:progress`, validated with
 * the Zod schema on load, saved at most once per 500 ms, and never throwing when storage is full.
 */
export function createProgressStore({
  backing,
  now = () => new Date().toISOString(),
  intervalMs,
}: StoreOptions): ProgressStore {
  let report: (f: StorageFailure) => void = () => undefined
  // A failure the learner dismissed stays quiet until a save succeeds again; otherwise the next
  // retry (or the dismissal itself, which is a state change) would bring it straight back.
  let dismissed: StorageFailure['kind'] | undefined
  const storage = debouncedStore(
    backing,
    (f) => {
      if (f.kind !== dismissed) report(f)
    },
    intervalMs,
    undefined,
    () => {
      dismissed = undefined
    },
  )

  const useStore = create<ProgressState>()(
    persist(
      (set) => {
        const apply = (fn: (p: Progress, t: string) => Progress) => {
          set((s) => ({ progress: fn(s.progress, now()) }))
        }
        return {
          progress: emptyProgress(now()),
          storageFailure: undefined,
          loadFailed: false,
          dismissStorageFailure: () => {
            set((s) => {
              dismissed = s.storageFailure
              return { storageFailure: undefined }
            })
          },
          setDisplayName: (name) => {
            apply((p, t) => actions.setDisplayName(p, name, t))
          },
          recordThresholdAnswer: (q, v) => {
            apply((p, t) => actions.recordThresholdAnswer(p, q, v, t))
          },
          completeThreshold: (placement) => {
            apply((p, t) => actions.completeThreshold(p, placement, t))
          },
          overrideLevel: (d, v) => {
            apply((p, t) => actions.overrideLevel(p, d, v, t))
          },
          chooseStartRegion: (r) => {
            apply((p, t) => actions.chooseStartRegion(p, r, t))
          },
          goToStep: (l, step) => {
            apply((p, t) => actions.goToStep(p, l, step, t))
          },
          completeStep: (l, step) => {
            apply((p, t) => actions.completeStep(p, l, step, t))
          },
          completeLesson: (l) => {
            apply((p, t) => actions.completeLesson(p, l, t))
          },
          setDepth: (l, v) => {
            apply((p, t) => actions.setDepth(p, l, v, t))
          },
          recordCheckAttempt: (c, v, passed) => {
            apply((p, t) => actions.recordCheckAttempt(p, c, v, passed, t))
          },
          updateChallenge: (c, patch) => {
            apply((p, t) => actions.updateChallenge(p, c, patch, t))
          },
          saveScenario: (s, patch) => {
            apply((p, t) => actions.saveScenario(p, s, patch, t))
          },
          updateSettings: (patch) => {
            apply((p, t) => actions.updateSettings(p, patch, t))
          },
          reset: () => {
            set({ progress: emptyProgress(now()) })
          },
        }
      },
      {
        name: PROGRESS_KEY,
        version: CURRENT_VERSION,
        storage: createJSONStorage(() => storage),
        partialize: (s) => ({ progress: s.progress }),
        // Every load is validated against the schema. Anything that doesn't validate is left in storage
        // untouched for E3-02's recovery, and the learner starts from a fresh record.
        merge: (persisted, current) => {
          const stored = (persisted as { progress?: unknown } | undefined)?.progress
          if (stored === undefined) return current
          const parsed = progressV1.safeParse(stored)
          return parsed.success
            ? { ...current, progress: parsed.data }
            : { ...current, loadFailed: true }
        },
      },
    ),
  )
  report = (f) => {
    useStore.setState({ storageFailure: f.kind })
  }
  return Object.assign(useStore, { storage })
}
