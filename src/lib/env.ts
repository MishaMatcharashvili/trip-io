import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The environment, validated. `next.config.ts` imports this file, so a build
// with a missing or malformed variable fails before it deploys rather than
// shipping a page that quietly does less.

export const env = createEnv({
  server: {
    /**
     * The token for the Directions API (src/infra/mapbox-directions.ts).
     * Server-only, and not the browser's token: the browser's is public and
     * restricted to this app's origins; this one is never sent anywhere but
     * Mapbox. Unset, route requests answer "not configured" and the map shows
     * stops without a road.
     */
    MAPBOX_DIRECTIONS_TOKEN: z.string().min(1).optional(),
    /**
     * What the routes proxy will spend (src/bll/route.ts). Each count is
     * Directions requests, the billable unit. These stop requests; a Mapbox
     * usage alert only sends an email.
     */
    ROUTES_USER_PER_MINUTE: z.coerce.number().int().positive().optional(),
    ROUTES_USER_PER_DAY: z.coerce.number().int().positive().optional(),
    ROUTES_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().optional(),
    ROUTES_GLOBAL_PER_DAY: z.coerce.number().int().positive().optional(),
  },
  client: {
    /**
     * The Mapbox GL JS token, for the browser. It must be a public token
     * (`pk.`), restricted in Mapbox to this app's URLs: whatever ships to the
     * browser is readable, and a secret token here would be a leak. Inlined
     * when the client is built, so it is required on Vercel; a local checkout
     * may leave it out and gets the ground colour and the itinerary list
     * instead of a map.
     */
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.VERCEL
      ? z.string().startsWith("pk.")
      : z.string().startsWith("pk.").optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
  },
  // `.env.example` lists every key with an empty value; empty means unset.
  emptyStringAsUndefined: true,
});
