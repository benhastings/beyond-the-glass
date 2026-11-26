# The capstone engine (E10-03)

`src/sim/capstone/engine.ts` (`CapstoneRun`) runs "The Long Night" ([`the-long-night.md`](the-long-night.md))
over a simulation:

- **Acts, one after another.** `start()` begins the first act and injects its faults. After each command
  (`record`), merge, or stretch of quiet time (`idle`, the war room's gentle background clock), `tick()`
  checks the act's objectives. When they hold, and the act's `minDuration` has passed, the next act begins.
  An act's faults are timed from its own start, so a learner who takes longer is never overtaken.
- **Hints:** `hint()` gives the act's nudge, then its pointer, then the command, and counts each.
- **Diagnosis:** once an act is over, `diagnose(act, option)` records the learner's answer to "what caused this?".
- **State:** everything (act, start and end times, actions, merges seen, answers) lives in the simulation's
  state, so the progress store's snapshot resumes mid-incident exactly.

## Scoring (for the debrief only; nothing is shown during the incident, and time is never scored)

`scores()` gives, per act:

| Score | Meaning |
|---|---|
| `evidenceFirst` | Something was looked at (`kubectl get/describe/logs/events/top`, `argocd app get/diff/history`) before the first change |
| `gitops` | The fix went through a merged merge request, with no hand-made changes in that act |
| `handChanges` | Changes made with kubectl during the act (from the audit log) |
| `risky` | Commands that were risky, each with why: deleting namespaces, Deployments or every pod; scaling to zero; hand edits on a self-healing app; turning auto-sync off |
| `wrongContext` | Changes made on a cluster other than the one in trouble |
| `hints` | Hints used |
| `diagnosis` | The learner's answer, and whether it was right |

## The war room (E10-04)

`/stormwatch` loads `src/app/stormwatch/WarRoom.tsx` as its own chunk. Seven panes (the incident, terminal,
Argo CD, pipelines and merge requests, dashboards, logs and traces, notes) sit two or three side by side,
or one maximized; below 1024 px they become tabs. Each pane is a region with a level-2 heading. Alt+1–7 jump
to a pane, Alt+M maximizes or restores, and ? lists the shortcuts. The layout is kept in `localStorage`
(`btg:war-room-layout`); the incident (a simulator snapshot) and the notes are kept with progress. A gentle
background clock moves the simulation 15 seconds every 5 seconds while the page is open.
