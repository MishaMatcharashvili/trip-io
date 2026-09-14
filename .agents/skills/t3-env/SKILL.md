# T3 Env

Use this skill when adding, changing, or consuming environment variables in Pocos.

Source:

- https://github.com/t3-oss/t3-env

## Project Rules

- Use `@t3-oss/env-core` from `@pocos/shared`; do not parse env ad hoc in apps or packages.
- Add server env variables to `packages/shared/src/env.ts`.
- Keep `.env.example` aligned with every required env variable.
- Use `parseServerEnv()` for the full server app contract.
- Use `parseDatabaseEnv()` or `getDatabaseUrl()` when database tooling only needs `DATABASE_URL`.
- Direct `process.env.*` access is only allowed inside `packages/shared/src/env.ts`. App code, package implementation code, Next config, API routes, DB clients, tests, and Playwright config must consume exported env helpers instead.
- Root `.env` must be readable from package working directories such as `apps/web`; keep the repo-root dotenv fallback in `packages/shared/src/env.ts` when changing env loading.

## Current Entry Points

- Full server env: `parseServerEnv()`
- Database-only env: `parseDatabaseEnv()`
- Database URL: `getDatabaseUrl()`

The env implementation should remain framework-agnostic so it works in Bun, Elysia, Drizzle tooling, workers, and Next server code.
