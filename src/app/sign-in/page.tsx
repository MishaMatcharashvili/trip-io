import type { Metadata } from "next";
import { AuthForm } from "@/features/auth-form";
import { AuthShell } from "@/features/auth-shell";
import { isGoogleConfigured } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { next } = await searchParams;

  return (
    <AuthShell
      icon="user"
      eyebrow="Welcome back"
      title="Sign in to trip.io"
      lead="Your trips, and everything I am watching on them, are waiting where you left them."
    >
      <AuthForm
        mode="sign-in"
        next={typeof next === "string" ? next : undefined}
        googleEnabled={isGoogleConfigured()}
      />
    </AuthShell>
  );
}
