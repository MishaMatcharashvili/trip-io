"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignIn() {
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/curate",
    });
    if (error) setError(error.message ?? "sign-in failed");
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background"
      >
        Continue with Google
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  );
}
