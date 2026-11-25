# Threshold screen-reader check (E4-02.AC2)

A manual check with **NVDA + Firefox** (and ideally VoiceOver + Safari). Record the results in
`docs/evidence/E4-02.md` under `## E4-02.AC2`: the date, the versions, and what was announced at each step.

Open `#/threshold` in a fresh browser profile (or after **Settings → Start over**).

| # | Do | Expect to hear |
|---|---|---|
| 1 | Tab to **Begin**, press Enter | "Question 1 of 10" (focus moves there) |
| 2 | Tab once | The radio group's question ("How often do you work on a Linux command line?"), then the first option and "1 of 4" |
| 3 | Arrow down twice | Each option as it's selected ("Most weeks, for routine checks, checked") |
| 4 | Tab to **Next →**, press Enter | "Question 2 of 11", then the new question when you Tab into the options |
| 5 | Answer to the end | "Reviewing your answers", with each question and its answer in order |
| 6 | Activate a **Change** button | Back on that question, with your answer checked |

Note anything announced twice, out of order, or not at all. Nothing should mention a score, a timer or
right and wrong.
