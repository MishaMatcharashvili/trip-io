---
name: strict-ts
description: Implement or review TypeScript boundaries, runtime validation, safe narrowing,
  shared contracts, and async error handling in Pocos.
metadata:
  version: 1.1.0
  category: software-engineering
  triggers:
  - typescript
  - ts
  - strict types
  - type safety
  - zod
  - runtime validation
  - shared types
  - generics
  - api contracts
  - frontend
  - backend
  - full-stack
  - monorepo
  - ai agent
  - webhook
  - integration
  - refactor
  - code review
  tags:
  - typescript
  - zod
  - generics
  - type-safety
  - runtime-validation
  - shared-contracts
  - monorepo
  - backend
  - frontend
  - ai-agent
---

# Strict TypeScript Agent Skill

You are a strict TypeScript implementation and review agent.

Use this skill when writing, reviewing, refactoring, or planning TypeScript code in modern projects, especially projects involving:

- frontend applications
- backend APIs
- full-stack TypeScript
- monorepos
- shared packages
- SaaS systems
- multi-tenant systems
- external integrations
- webhooks
- AI agents and tool-calling systems
- runtime validation with Zod or similar schema libraries

The goal is to produce TypeScript code that is safe, boring, reusable, maintainable, and clear.

This skill is intentionally package-manager and runtime agnostic. Follow the project’s existing tooling. Do not assume Bun, Node.js, npm, pnpm, yarn, Deno, or any specific framework unless the repository already uses it or the user explicitly says so.

---

## Project scope and reading strategy

Follow root `AGENTS.md` and `context/code-standards.md` over generic examples. Pocos uses Bun, native TypeScript 7, Biome, Better Auth, Axios, shared Zod contracts, and no direct component `useEffect`. Read only the linked topics needed for the task. Examples are reference material; confirm APIs against installed versions and `context/library-docs.md`.

## Prime Directive

Write code that is:

1. Type-safe by default.
2. Runtime-safe at external boundaries.
3. Easy to read.
4. Easy to test.
5. Easy for future agents and humans to modify.
6. Explicit where business rules matter.
7. Minimal in abstraction unless repetition or architecture justifies extraction.

Do not optimize for clever TypeScript.

Optimize for correctness, clarity, runtime safety, maintainability, and reusable contracts.

---

## Core TypeScript Rules

### Never Use `any`

Do not use `any`.

Forbidden:

```ts
const data: any = await response.json();

function handle(input: any) {
  return input.id;
}
```

Use `unknown` at untrusted boundaries, then validate or narrow:

```ts
const raw: unknown = await response.json();
const data = UserSchema.parse(raw);
```

Only use `any` after explicit user confirmation and only when no safer option is practical.

Before using `any`, explain why safer alternatives do not work.

### Infer Types as Much as Possible

Prefer inference when TypeScript can safely infer the type.

Prefer:

```ts
const user = {
  id: crypto.randomUUID(),
  role: "owner",
} satisfies User;
```

Avoid unnecessary annotations:

```ts
const user: User = {
  id: crypto.randomUUID(),
  role: "owner",
};
```

Use explicit types for public boundaries:

```ts
export function getSlug(pathname: string): string | null {
  return pathname.split("/").filter(Boolean).at(0) ?? null;
}
```

Good places for explicit types:

- exported functions
- public package APIs
- framework handlers
- domain services
- repository methods
- reusable utilities
- complex callbacks
- function return types where inference becomes unclear

Avoid explicit types for obvious local variables.

### Avoid `as SomeType`

Do not use type assertions as a shortcut:

```ts
const user = data as User;
```

This usually hides missing runtime validation.

Prefer Zod or equivalent schema validation:

```ts
const user = UserSchema.parse(data);
```

Prefer `satisfies` for compile-time shape checking:

```ts
const config = {
  strict: true,
  retries: 3,
} satisfies AppConfig;
```

Prefer type guards for runtime narrowing:

```ts
function isUserRole(value: string): value is UserRole {
  return value === "admin" || value === "member";
}
```

`as` is allowed only when all are true:

1. There is no reasonable type-safe alternative.
2. The assertion is local and narrow.
3. The value is already guaranteed by a framework, platform, or library boundary.
4. A short comment explains why it is safe.
5. The user has confirmed it if the cast affects business logic, auth, payments, database writes, tenant isolation, webhooks, or external API data.

Do not use `as` to force broken code to compile.

### Avoid Non-Null Assertions

Avoid:

```ts
const value = process.env.API_KEY!;
const user = session.user!;
```

Use validation or explicit branching:

```ts
if (!session.user) {
  throw new Error("Missing user");
}

const user = session.user;
```

For environment variables, validate once at startup or app initialization:

```ts
const EnvSchema = z.object({
  API_KEY: z.string().min(1),
});

export const env = EnvSchema.parse(process.env);
```

---

## Runtime Validation Rules

Read [Runtime Validation Rules](references/details/runtime-validation-rules.md#runtime-validation-rules) when working on this area.

## Shared Types and Contract Organization

Read [Shared Types and Contract Organization](references/details/runtime-validation-rules.md#shared-types-and-contract-organization) when working on this area.

## Generic Type Recommendations

Read [Generic Type Recommendations](references/details/generic-type-recommendations.md#generic-type-recommendations) when working on this area.

## Required Shared Helpers

Read [Required Shared Helpers](references/details/required-shared-helpers.md#required-shared-helpers) when working on this area.

## Type Guard Rules

Read [Type Guard Rules](references/details/type-guard-rules.md#type-guard-rules) when working on this area.

## Error Handling Rules

Read [Error Handling Rules](references/details/type-guard-rules.md#error-handling-rules) when working on this area.

## Project Structure Rules

Read [Project Structure Rules](references/details/type-guard-rules.md#project-structure-rules) when working on this area.

## API Boundary Rules

Read [API Boundary Rules](references/details/type-guard-rules.md#api-boundary-rules) when working on this area.

## Database Rules

Read [Database Rules](references/details/type-guard-rules.md#database-rules) when working on this area.

## Environment Rules

Read [Environment Rules](references/details/environment-rules.md#environment-rules) when working on this area.

## Async Rules

Read [Async Rules](references/details/environment-rules.md#async-rules) when working on this area.

## AI Agent Rules

Read [AI Agent Rules](references/details/environment-rules.md#ai-agent-rules) when working on this area.

## Frontend Rules

Read [Frontend Rules](references/details/environment-rules.md#frontend-rules) when working on this area.

## Integration Rules

Read [Integration Rules](references/details/environment-rules.md#integration-rules) when working on this area.

## Tooling Rules

Read [Tooling Rules](references/details/environment-rules.md#tooling-rules) when working on this area.

## Testing Rules

Read [Testing Rules](references/details/testing-rules.md#testing-rules) when working on this area.

## Preferred Patterns

Read [Preferred Patterns](references/details/testing-rules.md#preferred-patterns) when working on this area.

## Forbidden Patterns

Read [Forbidden Patterns](references/details/testing-rules.md#forbidden-patterns) when working on this area.

## Code Review Checklist

Read [Code Review Checklist](references/details/testing-rules.md#code-review-checklist) when working on this area.

## Agent Response Rules

Read [Agent Response Rules](references/details/agent-response-rules.md#agent-response-rules) when working on this area.

## Final Principle

TypeScript should protect runtime behavior, not only satisfy the compiler.

When in doubt:

- validate external data
- infer types from schemas
- centralize shared contract types
- use simple generics to remove real duplication
- avoid casts
- avoid `any`
- use `hasKey` for small key checks
- use schemas for real validation
- use `tryCatch` for predictable async failures
- keep code boring
- keep boundaries explicit
