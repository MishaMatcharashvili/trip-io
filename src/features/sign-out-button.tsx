"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button onClick={signOut} disabled={pending}>
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
