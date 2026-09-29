import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { computeRoute, defaultLimits } from "@/bll/route.ts";
import { type RouteFailure, routeRequest } from "@/domain/route/contract.ts";
import { requireSession, type SessionEnv } from "../auth.ts";

// The road between a trip's stops. Validation, status codes and nothing else;
// the rules on spending are in src/bll/route.ts. The request is the app's own
// shape, never Google's: what reaches the provider is built from it on the
// server.

/** Twenty-seven stops with a place id each is well under this. */
const MAX_BODY_BYTES = 16 * 1024;

/** What each failure is, as the status the client acts on. */
const status = {
  invalid: 422,
  "not-configured": 503,
  "rate-limited": 429,
  // A legitimate answer to the question: there is no road between these.
  "no-route": 200,
  quota: 503,
  // Our credential or the provider, not the traveller's doing.
  auth: 502,
  timeout: 504,
  upstream: 502,
  malformed: 502,
} as const satisfies Record<RouteFailure, number>;

const limit = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const route = new Hono<SessionEnv>().use(requireSession).post(
  "/",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ ok: false, reason: "invalid" as const }, 413),
  }),
  zValidator("json", routeRequest, (result, c) =>
    result.success
      ? undefined
      : c.json({ ok: false, reason: "invalid" as const }, 422),
  ),
  async (c) => {
    const outcome = await computeRoute(c.req.valid("json"), c.get("userId"), {
      limits: {
        userPerMinute: limit(
          "ROUTES_USER_PER_MINUTE",
          defaultLimits.userPerMinute,
        ),
        userPerDay: limit("ROUTES_USER_PER_DAY", defaultLimits.userPerDay),
        globalPerDay: limit(
          "ROUTES_GLOBAL_PER_DAY",
          defaultLimits.globalPerDay,
        ),
      },
    });
    return outcome.ok
      ? c.json(outcome, 200)
      : c.json(outcome, status[outcome.reason]);
  },
);
