<!-- Task-specific reference; maintained through SKILL.md. -->

## Testing Rules

Use the repository’s existing test runner.

Test:

- schemas
- type guards
- shared generic types where behavior exists
- error helpers
- API validation
- authorization
- sensitive/scoped queries
- business rules
- date/time logic
- webhook handling
- AI tool handlers
- external integration mapping

For multi-tenant or organization-scoped systems, always test negative isolation cases:

- user from organization A cannot read organization B data
- update/delete requires matching organization or tenant context
- AI tools cannot act outside the authorized scope

---

## Preferred Patterns

### `satisfies` for Config

```ts
const rolePermissions = {
  admin: ["users:create", "users:update"],
  member: ["users:read"],
} satisfies Record<UserRole, Permission[]>;
```

### `unknown` Plus Schema Validation

```ts
const raw: unknown = await response.json();
const payload = WebhookSchema.parse(raw);
```

### `Guard` for Structural Checks

```ts
// filter unknown arrays
return Array.isArray(raw) ? raw.filter(Guard.object).map(toItem) : [];

// one-off shape guard
const isUser = Guard.shape({ id: Guard.string, active: Guard.boolean });
if (isUser(raw)) { ... }
```

### `hasKey` for Lightweight Unknown Narrowing

```ts
// key + type in one call — no typeof follow-up needed
if (hasKey(error, "code", Guard.string)) {
  logger.warn({ code: error.code }, "External API error");
}

// key existence only when value type is checked elsewhere
if (hasKey(err, "statusCode") && err.statusCode === 429) return true;
```

### `tryCatch` for Tuple-Style Async Handling

```ts
const [data, error] = await tryCatch(fetchExternalData());

if (error) {
  return {
    ok: false,
    code: "EXTERNAL_SERVICE_FAILED",
    message: error.message,
  };
}
```

### Schema-Derived Types

```ts
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
});

export type User = z.infer<typeof UserSchema>;
```

### Centralized Generic Types

```ts
export type AppResult<TData, TCode extends string = string> =
  | { ok: true; data: TData }
  | { ok: false; code: TCode; message: string };

export type PaginatedResponse<TItem> = {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
};
```

### Exhaustive Switches

```ts
function getRoleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "member":
      return "Member";
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}
```

---

## Forbidden Patterns

Do not write:

```ts
const input = body as CreateUserInput;
```

Do not write:

```ts
const userId = session.user.id!;
```

Do not write:

```ts
function handler(data: any) {}
```

Do not write:

```ts
const value = response.data as ExternalApiResponse;
```

Do not write:

```ts
const dbUrl = process.env.DATABASE_URL!;
```

Do not write:

```ts
try {
  await riskyOperation();
} catch {}
```

Do not write scoped queries without scope checks.

Do not duplicate schema-inferred types manually in several files.

---

## Code Review Checklist

Before finalizing code, check:

- no `any`
- no unsafe `as SomeType`
- no non-null assertions
- no unvalidated environment variables
- external data enters as `unknown`
- schemas validate external boundaries
- types are inferred where practical
- public APIs have clear explicit types
- shared generic types live in a central types folder/package
- schema-inferred shared types are centralized and re-exported
- `Guard.*` is used for object/array/primitive checks on unknown values
- `hasKey(x, "key", Guard.string)` replaces `hasKey(x, "key") && typeof x.key === "string"`
- `Guard.object` replaces inline `typeof x === "object" && x !== null && !Array.isArray(x)` checks
- `tryCatch` is used where tuple-style async handling improves clarity
- business errors use typed result shapes
- auth and authorization are server-side
- sensitive queries are scoped
- webhook signatures are verified where available
- AI inputs and outputs are validated
- database JSON is validated
- raw database rows are not leaked unnecessarily
- project lint/format/typecheck/test commands pass
- no unnecessary dependency was added
- no architecture boundary was violated
- no server secret is exposed to client code

---
