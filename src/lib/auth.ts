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

/**
 * Whether Google sign-in is registered. The auth pages read this to show the
 * button as unavailable rather than letting it fail after a redirect.
 */
export function isGoogleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
  );
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
    // Email and password sit alongside Google so an account doesn't depend on
    // a Google login. No verification or reset emails yet: both need a sender,
    // which arrives with Resend in Phase 4. Until then sign-up signs straight in.
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
    },
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
