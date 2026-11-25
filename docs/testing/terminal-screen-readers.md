# Terminal screen-reader check (E6-09.AC1)

A manual check, run by a person, with **NVDA + Firefox** (Windows) and **VoiceOver + Safari** (macOS).
Record the results in `docs/evidence/E6-09.md` under `## E6-09.AC1`. Write the date, the versions, and
what was announced at each step.

Open `#/kitchen-sink` and Tab to the **Ravenpost terminal** (the input is labelled "Command").

| # | Do | Expect to hear |
|---|---|---|
| 1 | Type `pwd`, press Enter | "pwd. /home/operator" (the command echo, then the short output) |
| 2 | Type `kubectl get pods -A`, Enter | "kubectl get pods -A. N lines of output; press Alt+O to read." No table is read out |
| 3 | Press Alt+O | Focus moves to that output and it can be read line by line (NVDA: arrow keys in browse mode; VoiceOver: VO+arrows) |
| 4 | Back in the input, type `kubectl get pods -n ravenpost ravenpost-`, press Tab | "8 completions: …", and the input is unchanged |
| 5 | Press ↑ | The previous command is in the input and read out |
| 6 | Press Ctrl+L | "Screen cleared." |
| 7 | Type `kubectl edit cm ravenpost-config -n ravenpost`, Enter | The editor opens, with focus in "YAML for configmap/ravenpost-config" |
| 8 | Press Escape | "kubectl edit …. Edit cancelled, no changes made." and focus is back in the input |
| 9 | Using the headings list (NVDA: H / Insert+F7; VoiceOver rotor), move between commands | Each command is a level-3 heading, with the prompt and the command |

Note anything that's announced twice, cut off, or not announced at all.
