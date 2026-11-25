# Lesson template

Copy this to start a lesson. Files and folders starting with `_` are not part of the course, so nothing here
appears in the app until you copy it. The full guide is `docs/authoring.md`.

1. Copy `module-template/` into a region (`content/regions/<region>/<your-module>/`), or copy only the
   lesson files into an existing module.
2. Rename `lesson-template.mdx` and `lesson-template.checks.yaml` to your lesson's ID, and set `id` in the
   front matter to match.
3. Copy `challenge-template.yaml` to `src/challenges/<your-challenge>.yaml`, give it an ID, and add one line to
   `src/challenges/index.ts`.
4. Run `npm run lint:content`, `npm run diagrams` (if you changed a diagram) and `npm run dev`.
