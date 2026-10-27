"use client";

import { useActionState } from "react";
import { type LoginState, login } from "./actions";

const field =
  "rounded-lg border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );
  return (
    <form
      action={action}
      className="flex w-full max-w-xs flex-col gap-3 text-left"
    >
      <input type="hidden" name="next" value={next} />
      <label className="flex flex-col gap-1 text-sm">
        Username
        <input
          name="username"
          defaultValue={state?.username}
          autoComplete="username"
          required
          className={field}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={field}
        />
      </label>
      {state?.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
