import type { Metadata } from "next";
import { AuthForm } from "@/features/auth-form";
import { AuthShell } from "@/features/auth-shell";
import { isGoogleConfigured } from "@/lib/auth";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up">) {
  const { next } = await searchParams;

  return (
    <AuthShell
      eyebrow="Create an account"
      title="Keep your trips, and let me watch them"
      lead="An account saves what you plan and lets the watch layer follow it while you travel. Planning itself stays free."
    >
      <AuthForm
        mode="sign-up"
        next={typeof next === "string" ? next : undefined}
        googleEnabled={isGoogleConfigured()}
      />
    </AuthShell>
  );
}
