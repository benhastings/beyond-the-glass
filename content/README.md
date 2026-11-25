# Lesson content

Course content lives here as YAML and MDX. The build validates it and turns it into the manifest the app reads
(E5-01; schemas in `src/content/schema.ts`).

```text
content/
  glossary.yaml                          Field Guide terms
  regions/<region>/region.yaml           id, title, order, summary, mood
  regions/<region>/<module>/module.yaml  id, title, order, summary, domain
  regions/<region>/<module>/<lesson>.mdx front matter: id, title, order, objectives, estimatedMinutes,
                                         domain, level, prerequisites, scenario, terms
  __fixtures__/                          test content, not part of the course
```

- IDs are kebab-case and must match the folder or file name. Lesson IDs are unique across the whole course,
  because progress is stored by lesson ID.
- `order` sets the journey order among siblings.
- Every reference is checked when the app is built: `prerequisites` (lesson IDs), `terms` and `<Term id>`
  (glossary), and `scenario` and `<Terminal scenario>` (`src/scenarios/`). Prerequisites may not form a cycle.
- Region and module time estimates are the sums of their lessons' `estimatedMinutes`.
- Folders and files whose names start with `_` are ignored (drafts and templates).

A problem fails `npm run build` (and the dev server) with `file:line:column field: message`.

## Lesson components (E5-02)

Lessons can use these without importing them (registry: `src/app/lesson/components/index.ts`):

| Component | Use |
|---|---|
| `<Step id title>` | One step of the lesson |
| `<Analogy then="…" now="…">` | What the learner did on servers, and what the cluster does instead |
| `<Callout kind="info\|warn\|habit\|eli5">` | An aside with a visible label |
| `<Term id>` | A Field Guide link; its plain-words definition is the link's description |
| `<Diagram alt="…">` around a ```` ```mermaid ```` block | Rendered to SVG ahead of time. `alt` is required (the build fails without it). After adding or changing one, run `npm run diagrams` and commit `content/diagrams/` |
| `<CodeBlock language caption code>`, `<Kbd>` | Code and keys |
| `<Terminal scenario challenge?>` | A simulator terminal, with the challenge's checklist when one is given |
| `<Check id>` | A knowledge check (E5-03) |

`content/_samples/components.mdx` shows each one, and appears on `#/kitchen-sink`.
