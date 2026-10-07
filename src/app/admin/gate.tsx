import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyToken } from "@/lib/admin-session";
import { adminConfig } from "./config";
import { LoginForm } from "./login-form";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {children}
    </main>
  );
}

/**
 * Every admin page asks this before it reads anything: it returns the page to
 * show instead (the login form, or why there is none) or null when the visitor
 * holds a valid cookie. Checked per page, not once in the layout, because a
 * layout is not re-run when the reader moves between its pages.
 */
export async function keepOut(next: string) {
  const config = adminConfig();
  if (!config) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Admin</h1>
        <p className="max-w-sm text-zinc-600 dark:text-zinc-400">
          The login is not configured. Set <code>ADMIN_USERNAME</code>,{" "}
          <code>ADMIN_PASSWORD</code> and <code>BETTER_AUTH_SECRET</code>.
        </p>
      </Centered>
    );
  }
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (verifyToken(config, token, new Date())) return null;
  return (
    <Centered>
      <h1 className="text-xl font-semibold">Admin</h1>
      <LoginForm next={next} />
    </Centered>
  );
}
