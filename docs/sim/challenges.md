# Challenges (E6-10)

A challenge is one YAML file in `src/challenges/`, plus one line in `src/challenges/index.ts`. It's validated
at build time (`src/challenges/vite-plugin.ts`); the schema is `src/sim/challenges/schema.ts`.

| Field | What it is |
|---|---|
| `scenario` | The scenario ID it runs on |
| `brief` | What the learner is asked to do |
| `questions` | Questions answered in the terminal: `answer <id> <text>` |
| `objectives` | Each has `text` and a `check` predicate (below); the challenge is complete when all pass |
| `forbidden` | Patterns for harmful commands; running one shows the `message` (it never blocks completion) |
| `hints` | The ladder, in order: `nudge`, `pointer`, `command`. `hint` (or the button) reveals the next; the count is saved in progress |
| `expertPath` | Commands that solve it. CI runs them (`src/sim/challenges/engine.test.ts`) to prove the challenge is solvable |

## Predicates

- `ranCommand { pattern }`: a command in the history matches the regex.
- `noForbidden { pattern }`: no command in the history matches.
- `resourceState { resource, path, equals | matches, quantifier: all | any | none }`: a value at `path` (for example
  `status.containerStatuses[0].ready`) on the objects `resource` selects (`kind`, `namespace`, `name`, `namePrefix`,
  `labels`, `where`).
- `answered { question, matcher }`: the latest answer `equals` text, `matches` a regex, or names a `resource`.
  For `resource`, a unique prefix such as `ravenpost-notifier` also counts.
- `mutated { verb, kind?, name? }`: the learner made that change (from the audit log; for example `rollout-undo`).
- `changedVia { via: mr | kubectl, kind, name, only? }`: how an object was changed (E7-03). `mr` means Argo CD
  synced it from a revision that includes one of the learner's merged merge requests. `kubectl` means the learner
  changed it directly. With `only: true`, the other way must not have been used too, so "fixed through Git, not by
  hand" is `{ via: mr, only: true }`.
- `all { of }` and `any { of }` combine predicates.

The engine evaluates the objectives after every command, in well under 5 ms. Its state (answers, hints used,
completion) lives in the simulation, so the saved snapshot resumes it.
