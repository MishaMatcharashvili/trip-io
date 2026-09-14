<!-- Task-specific reference; maintained through SKILL.md. -->

## Required Shared Helpers

Projects using this skill should include these helpers in a shared utility module.

Recommended locations:

```txt
src/utils/guards.ts
src/utils/try-catch.ts
src/shared/utils/guards.ts
packages/shared/src/utils/guards.ts
packages/shared/src/utils/try-catch.ts
```

Use the existing project structure instead of forcing a new one.

### `Guard`

A class of static type guards for primitive and structural checks.

```ts
type TypeGuard<V> = (value: unknown) => value is V;

type Shape = Record<string, TypeGuard<unknown>>;

type InferShape<S extends Shape> = {
  [K in keyof S]: S[K] extends TypeGuard<infer V> ? V : never;
};

export class Guard {
  static string(value: unknown): value is string {
    return typeof value === "string";
  }

  static number(value: unknown): value is number {
    return typeof value === "number" && !Number.isNaN(value);
  }

  static boolean(value: unknown): value is boolean {
    return typeof value === "boolean";
  }

  static object(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  static array(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  static shape<S extends Shape>(shape: S): TypeGuard<InferShape<S>> {
    return (value: unknown): value is InferShape<S> => {
      if (!Guard.object(value)) return false;
      for (const key in shape) {
        const guard = shape[key];
        if (guard && !guard(value[key])) return false;
      }
      return true;
    };
  }
}
```

Use `Guard.object` instead of inline null/array checks on unknown values.

Use `Guard.shape` to build one-off structural guards without a full Zod schema:

```ts
const isUser = Guard.shape({
  id: Guard.string,
  name: Guard.string,
  active: Guard.boolean,
});

if (isUser(raw)) {
  // raw is { id: string; name: string; active: boolean }
}
```

### `hasKey`

Use this helper when checking whether an unknown object contains a key — optionally validating its type in the same call.

```ts
// Two-overload form:

// 1. Proves key exists — value is unknown
export function hasKey<K extends string>(
  input: unknown,
  key: K,
): input is Record<K, unknown>;

// 2. Proves key exists AND value matches guard — eliminates the typeof follow-up
export function hasKey<K extends string, V>(
  input: unknown,
  key: K,
  guard: TypeGuard<V>,
): input is Record<K, V>;
```

Prefer the guard overload to eliminate redundant `typeof` checks:

```ts
// Before
if (hasKey(err, "message") && typeof err.message === "string") { ... }

// After — one call, proven type
if (hasKey(err, "message", Guard.string)) { ... }
```

Pass any `Guard.*` method or custom type guard as the third argument:

```ts
if (hasKey(raw, "url", Guard.string) && hasKey(raw, "publicId", Guard.string)) {
  return { url: raw.url, publicId: raw.publicId };
}
```

Use `hasKey` without a guard when you only need to prove key existence:

```ts
if (hasKey(err, "statusCode") && err.statusCode === 429) return true;
```

Use `Guard.object` (not `hasKey`) to check whether a value is a plain object:

```ts
const raw: unknown = await res.json();
if (!Guard.object(raw)) throw new Error("Expected object response");
```

For filter callbacks on unknown arrays:

```ts
return Array.isArray(raw) ? raw.filter(Guard.object).map(toItem) : [];
```

Important:

- `hasKey` without a guard proves key existence only — value is `unknown`.
- `hasKey` with a guard proves both key existence and value type — no follow-up `typeof` needed.
- For complex multi-field validation, prefer `Guard.shape` or Zod.
- The guard overload returns `Record<K, V>` with a literal key — safe with `noUncheckedIndexedAccess`.

Example:

```ts
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (hasKey(error, "message", Guard.string)) return error.message;
  return String(error);
}
```

### `tryCatch`

Use this helper for predictable async error handling where tuple-style control flow is clearer than `try/catch`.

Supports an optional `onFinally` callback for cleanup that runs whether the promise succeeds or fails — replacing `try/catch/finally` blocks.

```ts
export async function tryCatch<T>(
  promise: Promise<T>,
  onFinally?: () => void | Promise<void>,
): Promise<[T, null] | [null, Error]> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    return [null, error instanceof Error ? error : new Error(String(error))];
  } finally {
    await onFinally?.();
  }
}
```

Prefer `tryCatch` when handling expected async failures:

```ts
const [user, error] = await tryCatch(getUserById(userId));

if (error) {
  return { ok: false, code: "USER_LOOKUP_FAILED", message: error.message };
}

return { ok: true, data: user };
```

Use `onFinally` to replace `try/catch/finally`:

```ts
// Before
try {
  await sendMessage(...);
} catch (err) {
  console.error(err);
} finally {
  setIsSending(false);
}

// After
const [, err] = await tryCatch(sendMessage(...), () => setIsSending(false));
if (err) console.error(err);
```

Good use cases:

- API calls
- database calls
- webhook processing
- background jobs
- AI tool execution
- integrations with auth, payment, messaging, storage, or analytics providers
- any async call that needs cleanup (`setLoading(false)`, `finishGeneration()`, etc.)

Do not overuse `tryCatch` when normal `try/catch` is clearer, especially when:

- multiple awaited operations share one rollback path
- errors need rethrowing
- transaction boundaries need one surrounding catch
- nested tuple handling becomes harder to read
- the boot/init function has a cancellation flag checked in both catch and finally

Prefer regular `try/catch` for transaction-style code:

```ts
try {
  await db.transaction(async (tx) => {
    await createUser(tx, input);
    await createAuditLog(tx, input);
  });
} catch (error) {
  logger.error({ error }, "Transaction failed");
  throw error;
}
```

---
