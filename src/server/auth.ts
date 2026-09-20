import { createMiddleware } from "hono/factory";
import { loadTripRef, type TripRef } from "@/dal/trips.ts";
import { getAuth } from "@/infra/auth.ts";
import { isCurator } from "@/lib/curator";

// Who is asking, and whether the thing they asked for is theirs. Both checks
// are the same in every route, so they are defined once here.
//
// Anonymous sessions count: a visitor plans a trip before there is an account
// (context/architecture.md), and Better Auth's onLinkAccount hands the trip over
// when they sign up.

export type SessionEnv = { Variables: { userId: string } };

/** Any signed-in session, anonymous included. */
export const requireSession = createMiddleware<SessionEnv>(async (c, next) => {
  const session = await getAuth().api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) return c.json({ error: "unauthenticated" }, 401);
  c.set("userId", session.user.id);
  await next();
});

/** A named curator with a verified email (src/lib/curator.ts). */
export const requireCurator = createMiddleware<SessionEnv>(async (c, next) => {
  const session = await getAuth().api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) return c.json({ error: "unauthenticated" }, 401);
  if (!isCurator(session.user)) return c.json({ error: "forbidden" }, 403);
  c.set("userId", session.user.id);
  await next();
});

export type TripAccess =
  | { ok: true; trip: TripRef }
  | { ok: false; body: { error: "not found" }; status: 404 }
  | { ok: false; body: { error: "forbidden" }; status: 403 };

/**
 * The check every trip handler starts with. It reads one row — owner and head —
 * rather than projecting the whole document: most handlers only need to know
 * whether to go on, and the ones that need the document load it themselves.
 */
export async function tripAccess(
  tripId: string,
  userId: string,
): Promise<TripAccess> {
  const trip = await loadTripRef(tripId);
  if (!trip) return { ok: false, body: { error: "not found" }, status: 404 };
  if (trip.userId !== userId) {
    return { ok: false, body: { error: "forbidden" }, status: 403 };
  }
  return { ok: true, trip };
}
