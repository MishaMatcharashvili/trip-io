import { AuthForm } from "@/features/auth-form";
import { AuthShell, authCopy } from "@/features/auth-shell";
import { isGoogleConfigured } from "@/infra/auth.ts";

// The screen's own frame and its own form, drawn before the page has read the
// address it was opened with. `inert` keeps it from being used in that moment —
// a sign-in that went to the wrong place afterwards is worse than a short wait —
// and the form the page then shows is the same one, so nothing moves.
export default function Loading() {
  return (
    <AuthShell {...authCopy["sign-up"]}>
      <div inert aria-busy="true">
        <AuthForm mode="sign-up" googleEnabled={isGoogleConfigured()} />
      </div>
    </AuthShell>
  );
}
