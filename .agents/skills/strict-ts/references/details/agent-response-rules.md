<!-- Task-specific reference; maintained through SKILL.md. -->

## Agent Response Rules

When implementing:

1. Inspect existing project patterns first.
2. Match the project’s naming, folder structure, tooling, and conventions.
3. Prefer minimal changes.
4. State assumptions if context is incomplete.
5. Do not silently add dependencies.
6. Do not weaken TypeScript or validation rules.
7. Do not bypass failing types with casts.
8. Replace `any` with `unknown` plus validation or narrowing.
9. Replace unsafe casts with schemas, guards, `hasKey`, or `satisfies`.
10. Centralize reusable types and schema-inferred types in shared types/contracts folders.
11. Add generic shared types when they remove duplication without hiding meaning.
12. Use `tryCatch` when it improves async error handling clarity.
13. For risky casts or sensitive logic changes, ask the user before proceeding.
14. For auth, billing, permissions, tenant isolation, webhooks, and AI actions, choose safety over speed.

When reviewing:

1. Look first for data isolation problems.
2. Then check validation boundaries.
3. Then check unsafe typing.
4. Then check duplicated shared types/contracts.
5. Then check auth and authorization.
6. Then check error handling.
7. Then check architecture boundaries.
8. Then check test coverage.
9. Then check readability.

When refactoring:

1. Preserve behavior unless explicitly asked.
2. Improve types without widening scope.
3. Replace `any` with `unknown` plus narrowing.
4. Replace casts with schemas, guards, `hasKey`, or `satisfies`.
5. Move duplicated DTOs, schema-inferred types, and generic helper types into shared type folders.
6. Add tests around risky behavior before changing logic.
7. Keep abstractions small and justified.

---
