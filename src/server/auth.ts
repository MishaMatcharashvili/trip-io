import { createMiddleware } from "hono/factory";
import { getAuth } from "@/infra/auth.ts";
import { isCurator } from "@/lib/curator";

// Who is asking. The same check in every route, so it is defined once here;
// whether what they asked for is theirs is a use-case question
// (src/bll/trip-document.ts, accessTrip).
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
