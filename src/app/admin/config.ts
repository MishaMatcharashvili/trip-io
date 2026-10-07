import type { AdminConfig } from "@/lib/admin-session";
import { env } from "@/lib/env";

/** The panel's login, or null when any of its three variables is unset: then the panel stays shut. */
export function adminConfig(): AdminConfig | null {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, BETTER_AUTH_SECRET } = env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD || !BETTER_AUTH_SECRET) return null;
  return {
    username: ADMIN_USERNAME,
    password: ADMIN_PASSWORD,
    secret: BETTER_AUTH_SECRET,
  };
}
