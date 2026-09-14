<!-- Task-specific reference; maintained through SKILL.md. -->

## Type Guard Rules

Use type guards for small runtime checks.

Use schemas for full object validation.

Good type guard:

```ts
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
```

Good object guard with `hasKey`:

```ts
function hasStringCode(input: unknown): input is { code: string } {
  return hasKey(input, "code") && typeof input.code === "string";
}
```

Avoid large hand-written validators:

```ts
function isCreateUserInput(value: unknown): value is CreateUserInput {
  // too much manual validation
}
```

Prefer:

```ts
const result = CreateUserSchema.safeParse(value);
```

---

## Error Handling Rules

### Use Typed Results for Expected Business Failures

Use typed result shapes for expected failures.

```ts
export type AppResult<TData, TCode extends string = string> =
  | { ok: true; data: TData }
  | { ok: false; code: TCode; message: string };
```

Good for:

- validation failures
- permission failures
- missing records
- duplicate records
- invalid state transitions
- rate limits
- subscription or billing restrictions
- recoverable external service failures

Use thrown errors for:

- programmer errors
- impossible states
- infrastructure failures
- failed invariants
- unrecoverable startup failures

### Normalize API Errors

Do not leak raw errors to clients.

Prefer stable error codes:

```ts
export type ApiErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";
```

Internal logs may include details. Client responses should be controlled.

---

## Project Structure Rules

Respect the existing repository structure.

Do not force a specific framework, runtime, package manager, or folder structure unless requested.

For larger projects, prefer clear separation between:

- schemas/contracts
- shared types
- domain logic
- data access
- API handlers
- UI components
- integration adapters
- utilities
- tests

Example feature structure:

```txt
src/
  features/
    users/
      users.schema.ts
      users.types.ts
      users.service.ts
      users.repository.ts
      users.test.ts
  shared/
    types/
    utils/
    schemas/
```

For monorepos, prefer shared contracts in a shared package:

```txt
packages/
  shared/
    src/
      schemas/
      types/
      utils/
```

Rules:

- app-specific code should not leak into shared packages
- shared packages should contain reusable contracts and pure utilities
- avoid circular dependencies
- avoid duplicate DTOs in separate apps
- avoid importing types from route files, UI files, or database implementation files when a shared contract should exist

---

## API Boundary Rules

For HTTP handlers:

1. Authenticate if required.
2. Resolve request context.
3. Validate params, query, headers, and body.
4. Authorize the action.
5. Call domain/service logic.
6. Return a typed response.
7. Normalize errors.

Generic example:

```ts
app.post("/users", async ({ body, user }) => {
  if (!user) {
    return errorResponse("UNAUTHORIZED", "Authentication required", 401);
  }

  const result = CreateUserSchema.safeParse(body);

  if (!result.success) {
    return errorResponse("INVALID_INPUT", result.error.flatten(), 400);
  }

  const [createdUser, error] = await tryCatch(createUser(result.data));

  if (error) {
    return errorResponse("INTERNAL_ERROR", "Could not create user", 500);
  }

  return UserResponseSchema.parse(createdUser);
});
```

Do not trust framework-inferred request bodies without runtime validation.

---

## Database Rules

### Validate JSON Columns

Any JSON from database columns must be parsed through a schema before use.

```ts
const metadata = MetadataSchema.parse(row.metadata);
```

Do not cast JSON columns:

```ts
const metadata = row.metadata as Metadata;
```

### Scope Sensitive Queries

For multi-tenant or organization-scoped systems, every scoped query must include the tenant, organization, account, or owner context.

Forbidden:

```ts
db.select().from(records).where(eq(records.id, id));
```

Required:

```ts
db
  .select()
  .from(records)
  .where(and(eq(records.id, id), eq(records.organizationId, organizationId)));
```

Never rely only on frontend filtering.

### Do Not Expose Raw DB Rows Unnecessarily

Map database rows to response DTOs.

```ts
const dto = UserResponseSchema.parse({
  id: row.id,
  email: row.email,
  name: row.name,
});
```

---
