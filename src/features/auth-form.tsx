"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/field";
import { Icon } from "@/ui/icon";

type Mode = "sign-in" | "sign-up";

/** Better Auth's messages are written for developers; these are for travellers. */
function describe(error: { status?: number; code?: string; message?: string }) {
  if (error.status && error.status >= 500) {
    return "I couldn't reach the account service. Try again in a moment.";
  }
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "That email and password don't match an account.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "There's already an account with that email. Sign in instead.";
    case "PASSWORD_TOO_SHORT":
      return "Use at least 8 characters.";
    case "INVALID_EMAIL":
      return "That doesn't look like an email address.";
    default:
      return error.message ?? "Something went wrong. Try again.";
  }
}

function GoogleMark() {
  // The multicolour "G" is Google's required sign-in mark, so it keeps its own
  // colours in both themes rather than taking the palette.
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

export function AuthForm({
  mode,
  next: rawNext,
  googleEnabled,
}: {
  mode: Mode;
  next?: string;
  googleEnabled: boolean;
}) {
  const router = useRouter();
  const next = safeNext(rawNext);
  const [pending, setPending] = useState<"email" | "google" | "guest" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  function done() {
    router.push(next);
    router.refresh();
  }

  async function submit(form: FormData) {
    setError(null);
    setPending("email");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const { error } =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email,
            password,
            name: String(form.get("name") ?? "").trim() || email.split("@")[0],
          })
        : await authClient.signIn.email({ email, password });
    setPending(null);
    if (error) setError(describe(error));
    else done();
  }

  async function google() {
    setError(null);
    setPending("google");
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: next,
    });
    // On success the browser is already leaving for Google.
    if (error) {
      setPending(null);
      setError(describe(error));
    }
  }

  async function guest() {
    setError(null);
    setPending("guest");
    const { error } = await authClient.signIn.anonymous();
    setPending(null);
    if (error) setError(describe(error));
    else done();
  }

  const busy = pending !== null;
  const nextQuery = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Button
          size="lg"
          block
          onClick={google}
          disabled={!googleEnabled || busy}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GoogleMark />
          {pending === "google" ? "Opening Google…" : "Continue with Google"}
        </Button>
        {googleEnabled ? null : (
          <p className="text-center text-mini text-ink-faint">
            Google sign-in isn't switched on yet.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-micro font-semibold uppercase tracking-[0.12em] text-ink-faint">
          or
        </span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      <form action={submit} className="flex flex-col gap-3.5">
        {mode === "sign-up" ? (
          <TextField
            label="Your name"
            name="name"
            autoComplete="name"
            placeholder="What should I call you?"
          />
        ) : null}
        <TextField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
        <TextField
          label="Password"
          name="password"
          type="password"
          autoComplete={
            mode === "sign-up" ? "new-password" : "current-password"
          }
          required
          minLength={8}
          hint={mode === "sign-up" ? "At least 8 characters." : undefined}
        />

        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-control border border-alert-line bg-alert-tint px-3 py-2.5 text-small text-alert"
          >
            <Icon name="warning" size={15} className="mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        ) : null}

        <Button type="submit" variant="primary" size="lg" block disabled={busy}>
          {pending === "email"
            ? mode === "sign-up"
              ? "Creating your account…"
              : "Signing in…"
            : mode === "sign-up"
              ? "Create account"
              : "Sign in"}
        </Button>
      </form>

      <p className="text-center text-small text-ink-muted">
        {mode === "sign-up" ? "Already have an account? " : "New to trip.io? "}
        <Link
          href={`${mode === "sign-up" ? "/sign-in" : "/sign-up"}${nextQuery}`}
          className="font-medium text-agent"
        >
          {mode === "sign-up" ? "Sign in" : "Create an account"}
        </Link>
      </p>

      <div className="flex flex-col items-center gap-1 border-t border-hairline pt-4">
        <button
          type="button"
          onClick={guest}
          disabled={busy}
          className="text-small font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {pending === "guest" ? "Starting…" : "Keep planning as a guest"}
        </button>
        <span className="text-center text-mini text-ink-faint">
          Planning works without an account. You only need one to save a trip
          and turn on watching.
        </span>
      </div>
    </div>
  );
}
