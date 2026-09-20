import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins/anonymous";
import { eq } from "drizzle-orm";
import { db } from "@/dal/client";
import { account, session, trip, user, verification } from "@/dal/schema";

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
      anonymous({
        // "No accounts until save": the visitor plans a trip anonymously, and
        // signing up hands it over. Better Auth then deletes the anonymous
        // user, and `trip.user_id` is set null on delete — so the trips have to
        // be reassigned here, before that happens, or the visitor loses the
        // trip they just built.
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          await db
            .update(trip)
            .set({ userId: newUser.user.id })
            .where(eq(trip.userId, anonymousUser.user.id));
        },
      }),
    ],
  });
}
