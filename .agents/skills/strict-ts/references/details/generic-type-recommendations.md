<!-- Task-specific reference; maintained through SKILL.md. -->

## Generic Type Recommendations

Use generics to make reusable contracts safer and less repetitive.

Good generics are simple, constrained, and obvious from usage.

Avoid abstract generics that make code harder to understand.

### Result Type

Use a reusable result type for expected business outcomes.

```ts
export type AppResult<TData, TCode extends string = string> =
  | { ok: true; data: TData }
  | { ok: false; code: TCode; message: string };
```

Usage:

```ts
type CreateUserError = "EMAIL_EXISTS" | "INVALID_ROLE";

type CreateUserResult = AppResult<UserResponse, CreateUserError>;
```

### API Response Type

```ts
export type ApiResponse<TData, TErrorCode extends string = string> =
  | { ok: true; data: TData }
  | { ok: false; error: { code: TErrorCode; message: string } };
```

Usage:

```ts
type GetUserResponse = ApiResponse<UserResponse, "USER_NOT_FOUND">;
```

### Pagination Type

```ts
export type PaginatedResponse<TItem> = {
  items: TItem[];
  page: number;
  pageSize: number;
  total: number;
};
```

Usage:

```ts
type UsersPage = PaginatedResponse<UserResponse>;
```

### Nullable and Optional Helpers

```ts
export type Nullable<T> = T | null;
export type Maybe<T> = T | null | undefined;
```

Use these sparingly. Prefer explicit `T | null` when it is clearer.

### ID Maps

```ts
export type EntityMap<TEntity extends { id: string }> = Record<TEntity["id"], TEntity>;
```

Usage:

```ts
type UserMap = EntityMap<UserResponse>;
```

### Constrained Generics

Prefer constrained generics when a function requires specific fields.

```ts
export function groupById<TEntity extends { id: string }>(
  items: TEntity[],
): Record<string, TEntity> {
  return Object.fromEntries(items.map((item) => [item.id, item]));
}
```

### Key-Based Generics

Use `keyof` when selecting values by key.

```ts
export function pickValue<TObject, TKey extends keyof TObject>(
  object: TObject,
  key: TKey,
): TObject[TKey] {
  return object[key];
}
```

### Generic API Client Function

Use generic return types only when the call site has a validated contract or parser.

Prefer parser-based generics:

```ts
export async function fetchJson<TData>(
  url: string,
  schema: z.ZodType<TData>,
): Promise<TData> {
  const response = await fetch(url);
  const raw: unknown = await response.json();
  return schema.parse(raw);
}
```

Avoid unsafe generic casting:

```ts
export async function fetchJson<TData>(url: string): Promise<TData> {
  const response = await fetch(url);
  return response.json() as Promise<TData>;
}
```

Generics should reduce duplication while keeping runtime validation intact.

---
