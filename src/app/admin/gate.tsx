import { headers } from "next/headers";
import { getAuth } from "@/infra/auth.ts";
import { isCurator } from "@/lib/curator";
import { SignIn } from "../curate/sign-in";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      {children}
    </main>
  );
}

/**
 * Every admin page asks this before it reads anything: it returns the page to
 * show instead (sign in, or not an operator) or null when the visitor may see
 * the panel. Checked per page, not once in the layout, because a layout is not
 * re-run when the reader moves between its pages.
 */
export async function keepOut(callbackURL: string) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session || session.user.isAnonymous) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Sign in with an operator account.
        </p>
        <SignIn callbackURL={callbackURL} />
      </Centered>
    );
  }
  if (!isCurator(session.user)) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Not an operator</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {session.user.email} isn&apos;t in <code>CURATOR_EMAILS</code>.
        </p>
      </Centered>
    );
  }
  return null;
}
