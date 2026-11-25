import { answerCommand } from './builtins/answer.ts'
import { catCommand } from './builtins/cat.ts'
import { cdCommand } from './builtins/cd.ts'
import { clearCommand } from './builtins/clear.ts'
import { exitCommand } from './builtins/exit.ts'
import { helpCommandFor } from './builtins/help.ts'
import { hintCommand } from './builtins/hint.ts'
import { lsCommand } from './builtins/ls.ts'
import { pwdCommand } from './builtins/pwd.ts'
import { historyCommand } from './builtins/history.ts'
import { whoamiCommand } from './builtins/whoami.ts'
import { kubectlConfig } from './kubectl/config.ts'
import { kubectlDelete } from './kubectl/delete.ts'
import { kubectlDescribe } from './kubectl/describe.ts'
import { kubectlDiff } from './kubectl/diff.ts'
import { kubectlEdit } from './kubectl/edit.ts'
import { kubectlAnnotate } from './kubectl/annotate.ts'
import { kubectlApply } from './kubectl/apply.ts'
import { kubectlLabel } from './kubectl/label.ts'
import { kubectlRollout } from './kubectl/rollout.ts'
import { kubectlScale } from './kubectl/scale.ts'
import { kubectlSet } from './kubectl/set.ts'
import { kubectlEvents } from './kubectl/events.ts'
import { kubectlLogs } from './kubectl/logs.ts'
import { kubectlTop } from './kubectl/top.ts'
import { kubectlGet } from './kubectl/get.ts'
import type { CommandDef } from './types.ts'

/**
 * Every command the terminal runs. To add one: a new file exporting a `defineCommand(...)`, plus one
 * line here (E6-04.AC4). `help` lists whatever is registered.
 */
export const COMMANDS: readonly CommandDef[] = [
  helpCommandFor(() => COMMANDS),
  hintCommand,
  answerCommand,
  clearCommand,
  historyCommand,
  whoamiCommand,
  exitCommand,
  lsCommand,
  catCommand,
  cdCommand,
  pwdCommand,
  kubectlGet,
  kubectlDescribe,
  kubectlLogs,
  kubectlEvents,
  kubectlTop,
  kubectlRollout,
  kubectlScale,
  kubectlDelete,
  kubectlSet,
  kubectlLabel,
  kubectlAnnotate,
  kubectlApply,
  kubectlDiff,
  kubectlEdit,
  kubectlConfig,
]
