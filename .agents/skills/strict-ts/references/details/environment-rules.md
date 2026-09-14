<!-- Task-specific reference; maintained through SKILL.md. -->

## Environment Rules

Validate environment variables at startup or app initialization.

```ts
const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_KEY: z.string().min(1),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = EnvSchema.parse(process.env);
```

Do not use:

```ts
process.env.DATABASE_URL!
```

Do not expose server secrets to client bundles.

For frontend public env vars, use explicit public prefixes and separate schemas.

---

## Async Rules

### Await Promises Intentionally

Avoid unhandled promises.

Forbidden:

```ts
sendEmail(input);
```

Required:

```ts
const [, error] = await tryCatch(sendEmail(input));

if (error) {
  logger.error({ error }, "Failed to send email");
}
```

For intentional fire-and-forget, make it explicit:

```ts
void sendAnalyticsEvent(event).catch((error: unknown) => {
  logger.warn({ error }, "Analytics event failed");
});
```

### Do Not Swallow Errors

Forbidden:

```ts
try {
  await riskyOperation();
} catch {}
```

Required:

```ts
const [, error] = await tryCatch(riskyOperation());

if (error) {
  logger.error({ error }, "Risky operation failed");
}
```

---

## AI Agent Rules

AI systems are untrusted runtime boundaries.

Validate:

- tool inputs
- tool outputs
- model structured outputs
- generated JSON
- workflow state
- memory/context payloads
- function-call arguments

Example:

```ts
const ToolInputSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["create", "update", "delete"]),
});

const input = ToolInputSchema.parse(rawToolInput);
```

Never let an AI model directly perform sensitive writes.

Sensitive writes include:

- auth changes
- permissions
- tenant or organization settings
- billing
- payments
- messaging
- database deletes
- external API writes
- user impersonation
- file deletion

Use narrow tool handlers that validate input, authorize action, execute one specific operation, and return typed results.

---

## Frontend Rules

### Forms

Use schemas for forms when possible.

Prefer one schema, or a schema family, across:

- frontend validation
- server-side validation
- API input validation

Example:

```ts
export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(120),
});
```

Do not duplicate unrelated validation logic across client and server.

### Components

Prefer explicit prop object types.

```ts
type UserCardProps = {
  user: UserResponse;
};

function UserCard({ user }: UserCardProps) {
  return <div>{user.name}</div>;
}
```

Avoid framework-specific component type aliases unless the repository already standardizes on them.

Keep interactive components small.

---

## Integration Rules

External integrations must be treated as unsafe.

For auth providers, payment providers, messaging services, AI providers, storage providers, queues, webhooks, and third-party APIs:

1. Verify signatures where available.
2. Validate payloads with schemas.
3. Use idempotency for webhooks and payment-like operations.
4. Do not cast SDK payloads into app types.
5. Map external DTOs into internal DTOs.
6. Log safely.
7. Never expose secrets.
8. Handle retries intentionally.

---

## Tooling Rules

Follow the repository’s existing tooling.

Do not assume a package manager, runtime, linter, formatter, or test runner.

Before suggesting commands, inspect project files where possible:

- `package.json`
- lockfiles
- runtime config
- formatter config
- linter config
- TypeScript config
- test config
- CI files

Use project scripts when available:

```bash
<package-manager> run lint
<package-manager> run typecheck
<package-manager> run test
```

Use the repository’s existing formatter/linter. Do not introduce a new formatter or linter unless the user asks or the project clearly requires it.

### TypeScript Strictness

Recommended compiler options:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true
  }
}
```

Do not weaken TypeScript settings to make code compile.

Fix the code instead.

---
