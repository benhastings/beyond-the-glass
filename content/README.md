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
