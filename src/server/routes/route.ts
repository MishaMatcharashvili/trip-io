import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { computeRoute, defaultLimits } from "@/bll/route.ts";
import { type RouteFailure, routeRequest } from "@/domain/route/contract.ts";
import { mapboxDirections } from "@/infra/mapbox-directions.ts";
import { env } from "@/lib/env.ts";
import { requireSession, type SessionEnv } from "../auth.ts";

// The road between a trip's stops. Validation, status codes and nothing else;
// the rules on spending are in src/bll/route.ts. The request is the app's own
// shape, never the provider's: what reaches Mapbox is built from it on the
// server, with a token the browser never has.

/** Twenty-five stops with an access point each is well under this. */
const MAX_BODY_BYTES = 16 * 1024;

/** What each failure is, as the status the client acts on. */
const status = {
  invalid: 422,
  "not-configured": 503,
  "rate-limited": 429,
  // A legitimate answer to the question: there is no road between these.
  "no-route": 200,
  // A stop with no road near it: a question about the trip, not a fault.
  "unroutable-stop": 200,
  quota: 503,
  // Our credential or the provider, not the traveller's doing.
  auth: 502,
  timeout: 504,
  upstream: 502,
  malformed: 502,
} as const satisfies Record<RouteFailure, number>;

const provider = mapboxDirections({ token: env.MAPBOX_DIRECTIONS_TOKEN });

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
      provider,
      limits: {
        userPerMinute:
          env.ROUTES_USER_PER_MINUTE ?? defaultLimits.userPerMinute,
        userPerDay: env.ROUTES_USER_PER_DAY ?? defaultLimits.userPerDay,
        globalPerMinute:
          env.ROUTES_GLOBAL_PER_MINUTE ?? defaultLimits.globalPerMinute,
        globalPerDay: env.ROUTES_GLOBAL_PER_DAY ?? defaultLimits.globalPerDay,
      },
    });
    return outcome.ok
      ? c.json(outcome, 200)
      : c.json(outcome, status[outcome.reason]);
  },
);
