<!-- Task-specific reference; maintained through SKILL.md. -->

## Runtime Validation Rules

### External Data Must Enter as `unknown`

Treat these as untrusted:

- HTTP request bodies
- route params
- query params
- headers
- cookies
- local storage values
- database JSON columns
- webhook payloads
- third-party API responses
- authentication claims
- payment provider payloads
- AI tool inputs
- AI model outputs
- environment variables
- `fetch().json()` results
- file contents
- CLI arguments
- message queue payloads

Pattern:

```ts
const raw: unknown = await request.json();
const input = CreateUserSchema.parse(raw);
```

Safe user-facing validation pattern:

```ts
const result = CreateUserSchema.safeParse(raw);

if (!result.success) {
  return {
    ok: false,
    code: "INVALID_INPUT",
    issues: result.error.flatten(),
  };
}

const input = result.data;
```

### Use Zod or Equivalent Runtime Schemas as Contract Sources

For data crossing runtime boundaries, define a schema first and infer TypeScript types from it.

```ts
import { z } from "zod";

export const CreateUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(["admin", "member"]),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
```

Avoid duplicate manual interfaces for schema-shaped data:

```ts
interface CreateUserInput {
  name: string;
  email: string;
  role: "admin" | "member";
}

const CreateUserSchema = z.object({
  // duplicated shape
});
```

Prefer schema-derived types unless a separate interface is clearly needed.

### Prefer `safeParse` for Expected Invalid Input

Use `safeParse` when invalid input is expected and should return a controlled response.

Use `parse` when invalid input means programmer error, invalid configuration, or unrecoverable state.

Examples:

```ts
// User/API input
const result = CreateUserSchema.safeParse(raw);

// Startup configuration
const env = EnvSchema.parse(process.env);
```

---

## Shared Types and Contract Organization

Centralize reusable types in a shared types area.

Recommended locations:

```txt
src/types/
src/shared/types/
packages/shared/src/types/
packages/contracts/src/types/
```

Use the structure that matches the repository. In a monorepo, prefer a shared package. In a single app, prefer a central `src/types` or `src/shared/types` folder.

### What Belongs in Shared Types

Centralize:

- schema-inferred types
- DTOs
- API request and response contracts
- branded IDs
- reusable generic types
- domain enums and unions
- result/error types
- pagination types
- permission/action types
- integration payload contracts after mapping into internal shape

Example:

```txt
shared/
  schemas/
    user.schema.ts
    appointment.schema.ts
  types/
    api.types.ts
    result.types.ts
    pagination.types.ts
    ids.types.ts
    utility.types.ts
```

### Re-Export Shared Types Cleanly

Use central exports so feature code imports contracts from one stable location.

```ts
export type { User, UserResponse } from "../schemas/user.schema";
export type { AppResult, ApiErrorCode } from "./result.types";
export type { PaginatedResponse, PaginationInput } from "./pagination.types";
```

Avoid scattering duplicate types across features.

Avoid importing types from UI files, route files, or database implementation files when a shared contract should exist.

### Schema-Inferred Types Should Also Be Centralized

If a schema is reusable, colocate the inferred type with it and re-export it through the shared type barrel.

```ts
export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;
```

Then reuse it across API handlers, frontend components, tests, and AI tools.

Do not redefine the same response type manually in multiple places.

---
