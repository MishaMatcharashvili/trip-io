import type { Metadata } from "next";
import { AuthForm } from "@/features/auth-form";
import { AuthShell, authCopy } from "@/features/auth-shell";
import { isGoogleConfigured } from "@/infra/auth.ts";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up">) {
  const { next } = await searchParams;

  return (
    <AuthShell {...authCopy["sign-up"]}>
      <AuthForm
        mode="sign-up"
        next={typeof next === "string" ? next : undefined}
        googleEnabled={isGoogleConfigured()}
      />
    </AuthShell>
  );
}
