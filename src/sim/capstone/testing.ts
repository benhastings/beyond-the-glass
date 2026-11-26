import { parseDuration } from '../core/duration.ts'
import type { Simulator } from '../core/simulator.ts'
import { playExpertPath } from '../gitops/fragments/define.ts'
import { CapstoneRun } from './engine.ts'

const MIN = 60_000

/** Plays the expert path of every act (up to act `until`), as a learner would, through the engine. Tests only. */
export function expertNight(sim: Simulator, until = Infinity): CapstoneRun {
  const run = new CapstoneRun(sim)
  run.start()
  for (let guard = 0; !run.finished && guard < 8 && run.actIndex < until; guard++) {
    const act = run.current
    if (!act) break
    run.idle(parseDuration(act.minDuration))
    const i = run.actIndex
    playExpertPath(sim, act.expertPath, (step) => {
      if ('run' in step) run.record(step.run)
      else run.tick()
    })
    const actNow = () => run.actIndex
    const done = () => run.finished
    for (let k = 0; k < 20 && actNow() === i && !done(); k++) run.idle(MIN)
    if (act.diagnosis) run.diagnose(act.id, act.diagnosis.options.find((o) => o.correct)?.id ?? '')
  }
  return run
}
