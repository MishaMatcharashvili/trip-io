import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins/anonymous";
import { db } from "@/db/client";
import { account, session, user, verification } from "@/db/schema";

let instance: ReturnType<typeof build> | undefined;

// Built on first request, not at import: `next build` imports route modules to
// collect their config, and constructing the Drizzle adapter reaches for
// DATABASE_URL. Deferring keeps the build hermetic while still failing loudly
// on a real request when the env is missing.
export function getAuth() {
  instance ??= build();
  return instance;
}

function build() {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      // Only the auth tables: passing the whole schema barrel would let a future
      // domain table collide with a Better Auth model name.
      schema: { user, session, account, verification },
    }),
    // Google stays unregistered until credentials are supplied (Phase 0
    // procurement). Anonymous sessions work without it.
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {},
    plugins: [
      // Better Auth deletes the anonymous user when it links to a real account.
      // With `trip.userId` set null on delete, that would silently orphan the
      // trip the visitor just built — the opposite of the "anonymous trip ->
      // account at save -> trip claimed" flow. Keep the row until Phase 2 adds an
      // `onLinkAccount` handler that reassigns the trip, then drop this.
      anonymous({ disableDeleteAnonymousUser: true }),
    ],
  });
}
