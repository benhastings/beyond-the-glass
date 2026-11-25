import { z } from 'zod'
import { commit, repo, resolve } from '../../gitops/git.ts'
import { defineTimelineEvent } from './define.ts'

/**
 * Someone else pushes to a repo (E7-06): a colleague's release, a hurried fix. `replace` edits text in a
 * file (each `from` must be there); `changes` sets whole files (`null` deletes one).
 */
export const gitCommit = defineTimelineEvent({
  type: 'gitCommit',
  description: 'A colleague pushes a commit to a repo (edits by text replacement, or whole files)',
  schema: z.strictObject({
    repo: z.string(),
    branch: z.string().optional(),
    message: z.string().min(1),
    author: z.string().default('ana'),
    replace: z
      .array(z.strictObject({ file: z.string(), from: z.string(), to: z.string() }))
      .default([]),
    changes: z.record(z.string(), z.string().nullable()).default({}),
  }),
  apply: (sim, _cluster, p) => {
    const r = repo(sim, p.repo)
    const branch = p.branch ?? r?.defaultBranch ?? 'main'
    const head = r && resolve(r, branch)
    if (!r || !head) throw new Error(`gitCommit: no branch ${branch} in ${p.repo}`)
    const changes: Record<string, string | null> = { ...p.changes }
    for (const x of p.replace) {
      const text = changes[x.file] ?? head.files[x.file]
      if (text == null || !text.includes(x.from))
        throw new Error(`gitCommit: "${x.from}" isn't in ${p.repo}/${x.file}`)
      changes[x.file] = text.replace(x.from, x.to)
    }
    commit(sim, p.repo, branch, changes, p.message, p.author)
  },
})
