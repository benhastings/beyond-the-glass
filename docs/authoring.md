# Writing lessons

This guide is for anyone adding to the course. To start, copy `content/_template/` (see its README). The
reference docs are:

- **`content/README.md`**: file layout, components, checks, depth layers, and what finishing a lesson takes.
- **`docs/sim/challenges.md`**: terminal challenges and their predicates.
- **`docs/sim/support-matrix.md`**: every command the simulator runs.

## Who you're writing for

The learners run systems for a living: NOC and operations staff who know servers, processes, logs and
on-call. They're new to Kubernetes, GitOps and observability, not to operations. Write for a colleague.

- **Start from what they know.** Before introducing a concept, say what it replaces on a server. That's
  what `<Analogy then="…" now="…">` is for.
- **Respect their time and experience.** Don't use "simply", "just", "obviously", "easy" or "trivial". What's
  easy for you may not be easy for them, and the words make anyone who struggles feel slow.
  `npm run lint:content` flags them.
- **No scores, no clocks.** Checks give feedback, never marks, and nothing is timed.
- **Plain words first.** An `<ELI5>` layer should read at grade 8 or below: short sentences, short words, one
  idea each. The lint measures it (Flesch-Kincaid).
- **Name real tools in text, not their logos.** Kubernetes, Argo CD, GitLab, Grafana, Prometheus and
  OpenTelemetry can be named. Every example system is the fictional Ravenpost, on `*.example` hosts.
  Never use a real hostname, IP address, team, person or ticket.

## Structure of a lesson

A lesson is one MDX file with front matter (`id`, `title`, `objectives`, `estimatedMinutes`, `domain`,
`level`, `scenario`, `terms`) and three to six `<Step>`s.

1. **Objectives** are what the learner can *do* afterwards, starting with a verb: "List the pods in a
   namespace", not "Understand pods". They appear in the lesson header and on the completion screen.
2. **One idea per step**, under about 350 words (the lint warns above that). A step usually goes: what it
   replaces, the idea, a short example, then something to try.
3. **Let them do it.** Put a `<Terminal scenario="ravenpost" challenge="…">` where the idea is fresh. Every
   command a lesson shows must run in the simulator (`docs/sim/support-matrix.md`).
4. **Check understanding** with a `<Check>` near the end, and mark it `required: true` if the lesson isn't
   complete without it. Give feedback for each wrong option that says *why* it's wrong.
5. **Depth:** where people with different backgrounds need different detail, use `<Depth>` with
   `<ELI5>`, `<Operator>` and `<DeepDive>`. Always include an ELI5 layer; the build warns without one.
6. **Interactive explainers:** `<OtelPipeline />` shows the OpenTelemetry pipeline (SDK → OTLP → Collector →
   stores), with switches that break it and the Collector config to match. It loads only when a lesson uses it.

## Writing an analogy

`<Analogy then="…" now="…">` pairs an on-prem practice with its cluster counterpart.

- Use something they did often: "You restarted a service with systemctl when it fell over."
- Then say what happens now, and who does it: "The kubelet restarts the container for you, and counts each
  restart."
- Keep both halves concrete, and in the same shape, so the difference stands out.
- If the analogy breaks somewhere important, say where in the step text. Analogies are a bridge, not a
  definition.

## Adding a challenge

1. Copy `content/_template/challenge-template.yaml` to `src/challenges/<id>.yaml`, and add one line to
   `src/challenges/index.ts`.
2. Write the `brief` as the task, and `objectives` as checks the learner can see ticking off. Use
   `ranCommand` for "did they look", `answered` for "did they find it", and `resourceState` or `mutated` for
   "did they fix it". Use `changedVia` when it matters whether the fix went through a merge request or kubectl.
3. Write three `hints` in order: a nudge (where to look), a pointer (which command), and the exact command.
   Hints never block completion.
4. Add `forbidden` patterns for commands that would do harm, with a message saying why.
5. Fill in `expertPath`. CI runs it to prove the challenge can be solved (`npm test`).

## Before you open a pull request

- `npm run lint:content`: style lint. To keep a flagged word on purpose (quoting a log line, say), add
  `{/* lint-allow: banned-word (why) */}` on the line or the line above. In YAML, use
  `# lint-allow: banned-word (why)`.
- `npm run diagrams`, if you added or changed a `<Diagram>`; commit `content/diagrams/`.
- `npm run dev`, then open your lesson at `#/lesson/<id>` and work through it, with the keyboard only
  for at least one pass.

## Requesting SME review

Content pull requests need approval from a subject-matter expert, which CODEOWNERS enforces. In the PR
description:

- link the lesson (`#/lesson/<id>` on the PR preview, or a screenshot of each step),
- list the objectives, and say which claims a reviewer should check ("CrashLoopBackOff's wait doubles to
  five minutes"),
- note anything you simplified on purpose, so the reviewer can confirm the simplification isn't misleading.

Reviewers check that it's correct, that it's what an operator would actually do, and that the tone follows
this guide.
