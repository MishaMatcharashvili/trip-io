import type { Metadata } from "next";
import { AuthForm } from "@/features/auth-form";
import { AuthShell, authCopy } from "@/features/auth-shell";
import { isGoogleConfigured } from "@/infra/auth.ts";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  const { next } = await searchParams;

  return (
    <AuthShell {...authCopy["sign-in"]}>
      <AuthForm
        mode="sign-in"
        next={typeof next === "string" ? next : undefined}
        googleEnabled={isGoogleConfigured()}
      />
    </AuthShell>
  );
}
