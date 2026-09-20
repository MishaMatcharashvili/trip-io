<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Commits

**Atomic commits, always.** One coherent change per commit — a module and its tests, a migration, a
refactor, an extraction — small enough to review, revert or bisect on its own. Never one large
commit spanning dozens of files, however coherent the work feels as a whole.

- Commit as each piece lands, not in one sweep at the end.
- Mechanical changes (refactors, extractions, renames, formatting) go in their own commits, apart
  from behaviour changes.
- Schema and migration changes are their own commit, separate from the code that uses them.
- Docs are their own commit unless inseparable from the change they describe.
- Many commits on a branch is right; one enormous commit in a PR is not. If work has piled up,
  `git reset --soft` and split it before pushing.

# Layers

```
domain  ←  dal  ←  bll  ←  server  ←  app          (infra sits beside dal)
```

Before adding a file, decide which layer it belongs to. `context/architecture.md` has the table;
`src/layers.test.ts` enforces it. The short version:

- `src/domain` is pure — no IO, no environment, no dependency but Zod. New rules go here.
- `src/dal` is the only place that writes SQL or imports Drizzle. One repository per aggregate.
- `src/bll` holds use cases: the order things happen in, and the transaction they happen in.
- `src/infra` holds outbound adapters, and is the only place an external provider is named.
- `src/server` route handlers do validation and status codes. They call use cases, never repositories.

When the layers test fails, move the code left rather than adding an exception.
