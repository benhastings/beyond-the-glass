# Simulator support matrix

Every command and flag the terminal supports. Update this file in the same PR as any change to
`src/sim/commands/` (AGENTS.md §6). Output formats follow real kubectl; see the realism notes at the end.

## Shell

| Feature | Supported |
|---|---|
| Quoting | `'single'`, `"double"` (with `\"`, `\\`, `` \` ``, `\$` escapes), `\` outside quotes |
| Pipes | `cmd \| grep \| head …`: any number of stages after one command |
| Not supported | `&&`, `\|\|`, `;`, `>`, `<`, `&`, `$(…)`, backticks: an explanation is printed instead |
| Tab completion | Commands, kubectl verbs, resource types, pod names, flag names, and values for `-n`, `--context`, `-o` |
| Errors | Never thrown: an unexpected failure prints a message and changes nothing |

### Built-ins

| Command | What it does |
|---|---|
| `help [COMMAND]` | Lists the supported commands, or shows one command's help |
| `hint` | The next hint for the running challenge (E6-10); otherwise suggests a first look |
| `clear` | Clears the screen (also Ctrl+L) |
| `history` | Numbered list of commands run in this terminal |
| `whoami` | Prints `operator` and your place on the watch |
| `exit` | Closes the terminal panel |

### After a pipe

| Command | Flags |
|---|---|
| `grep PATTERN` | `-i`, `-v`, `-c`, `-E` (patterns are regular expressions; an invalid one is matched literally) |
| `head`, `tail` | `-n N`, `-N` (default 10) |
| `wc` | `-l` only |

## kubectl

### Global flags (every kubectl command)

| Flag | Meaning |
|---|---|
| `-n`, `--namespace` | Namespace (default: the context's namespace, else `default`) |
| `-A`, `--all-namespaces` | Every namespace |
| `--context` | Kubeconfig context (default: current) |
| `-o`, `--output` | Output format (per command, below) |
| `-l`, `--selector` | Label selector: `k=v`, `k==v`, `k!=v`, `k in (a,b)`, `k notin (a)`, `k`, `!k`, comma-separated |
| `-h`, `--help` | Command help |

Flags may come before or after the verb (`kubectl -n ravenpost get pods`), in any of the forms
`--flag=value`, `--flag value`, `-n value`, `-nvalue` and combined boolean shorthands (`-it`).

### Commands

| Command | Status | Notes |
|---|---|---|
| `kubectl get TYPE[,TYPE] [NAME…]` | Supported (E6-05) | pods (`po`), deployments (`deploy`), replicasets (`rs`), services (`svc`), endpoints (`ep`), nodes (`no`), namespaces (`ns`), configmaps (`cm`), secrets, events (`ev`); also `TYPE/NAME` and `all` |
| `kubectl get … -o wide\|name\|yaml\|json` | Supported (E6-05) | YAML as kubectl writes it: sorted keys, quoted timestamps; Secret values show as `<redacted: N bytes>` |
| `kubectl get … --show-labels`, `-l`, `--sort-by=.path`, `--no-headers` | Supported (E6-05) | `--sort-by` takes simple paths such as `.lastTimestamp` or `.status.containerStatuses[0].restartCount` |
| `kubectl get … -w` | Supported (E6-05) | Watches for one minute of simulated time, printing rows as they change |
| `kubectl describe pod\|deployment\|service\|node [NAME_PREFIX]` | Supported (E6-05) | kubectl's section layout, State/Last State, Conditions, Events with `(xN over …)`; names match by prefix; `-l` |
| `kubectl describe` other types | Not yet | Explains, and suggests `kubectl get TYPE -o yaml` |
| `kubectl logs`, `events`, `top` | Planned (E6-06) | |
| `kubectl rollout`, `scale`, `delete`, `set image`, `label`, `annotate` | Planned (E6-07) | |
| `kubectl apply`, `diff`, `edit` | Planned (E6-08) | |
| `kubectl config get-contexts [NAME]` | Supported (E6-12) | `*` marks the current context; `--no-headers`, `-o name` |
| `kubectl config current-context`, `use-context NAME` | Supported (E6-12) | `Switched to context "prod".` |
| `kubectl config set-context --current\|NAME --namespace=NS` | Supported (E6-12) | Changes the context's default namespace; creating contexts isn't simulated |

Planned commands answer "works on a real cluster, but this simulator doesn't run it yet" until they land.

### Real, but not simulated

These explain what they would do on a real cluster and suggest something to try instead:
`port-forward`, `exec`, `cp`, `attach`, `proxy`, `debug`, `auth`, `drain`, `cordon`, `uncordon`, `taint`, `run`,
`create`, `patch`, `replace`, `expose`, `autoscale`, `explain`, `api-resources`, `cluster-info`, `wait`,
`certificate`, `plugin`, `completion`, `kustomize`, `version`. The messages are in
`src/sim/commands/kubectl/unsupported.ts`.

Familiar programs that don't exist here (`ssh`, `sudo`, `systemctl`, `service`, `journalctl`, `ps`, `top`,
`docker`, `curl`, `wget`, `ping`, `traceroute`, `vi`/`vim`/`nano`, `helm`, `ls`, `cat`, `cd`, `echo`) get an
in-world explanation too (`src/sim/commands/not-here.ts`). Anything else gets bash's
`command not found`, with a "Did you mean" when a supported command is within two edits.

## Errors that match kubectl

| Situation | Output |
|---|---|
| Unknown resource type | `error: the server doesn't have a resource type "pdos"`, then a sim hint: ``Did you mean `pods`?`` |
| Unknown verb | `error: unknown command "gte" for "kubectl"` / `Did you mean this?` / tab-indented candidates / `Run 'kubectl --help' for usage.` |
| Unknown flag | `error: unknown flag: --nmespace` or `error: unknown shorthand flag: 'x' in -x`, then `See 'kubectl get --help' for usage.` |
| Missing flag value | `error: flag needs an argument: 'n' in -n` / `error: flag needs an argument: --namespace` |
| Unknown pod | `Error from server (NotFound): pods "x" not found` |
| Nothing found | `No resources found in <ns> namespace.` (or `No resources found` with `-A`) on stderr |
| Unknown context | `error: context "x" does not exist` (`--context`), `error: no context exists with the name: "x"` (`use-context`) |
| Bad selector | `error: unable to parse requirement: invalid selector "…"` |

"Did you mean" suggestions use the optimal string alignment distance (insert, delete, substitute or swap
adjacent letters), up to 2.

## Realism notes

- Tables use kubectl's tab writer settings (minimum width 10, padding 3), so columns line up as they do in
  a real terminal.
- `STATUS`, `READY` and `RESTARTS` follow kubectl's `printPod` logic, including `CrashLoopBackOff`, `OOMKilled`,
  `ExitCode:N`, `Terminating` and restarts shown as `9 (110s ago)`.
- `AGE` uses kubectl's human duration format (`45s`, `3m12s`, `26h`, `2d4h`, `8d`).
- Until E6-11's captured fixtures land, formats are checked against kubectl's source and documented
  behavior; E6-11 adds structural comparisons with a real kind cluster.

## The prompt

The terminal prompt shows the current context and namespace (`promptState`). A context whose name or
cluster contains `prod` or `production` as a word is shown as a warning, with an icon and the word
"(production)". When the context or namespace changes, a polite live region announces it.
