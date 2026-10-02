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
    /**
     * Tripadvisor's Terra API key (src/infra/tripadvisor.ts), for the ratings,
     * reviews and photos on a place. Server-only: it rides in a header to
     * Tripadvisor and goes nowhere else. Unset, places show without them.
     */
    TRIPADVISOR_API_KEY: z.string().min(1).optional(),
    /**
     * What the place-enrichment use case will spend (src/bll/place-enrichment.ts).
     * Each open place is about three billable calls, so these are what stand
     * between a busy day and the bill. Unset, the defaults apply.
     */
    TRIPADVISOR_USER_PER_DAY: z.coerce.number().int().positive().optional(),
    /**
     * How long what Tripadvisor said about a place is kept in Redis, in
     * seconds. Unset, 12 hours. 0 keeps nothing: the one switch back to
     * reading the provider on every visit.
     */
    TRIPADVISOR_CONTENT_TTL_S: z.coerce.number().int().min(0).optional(),
    /**
     * Upstash Redis, over REST (src/infra/upstash.ts): where that content is
     * kept. Vercel's Redis integration sets both under these names. Unset,
     * nothing is kept and every visit asks the provider.
     */
    UPSTASH_REDIS_REST_URL: z.url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
    TRIPADVISOR_GLOBAL_PER_DAY: z.coerce.number().int().positive().optional(),
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
    /**
     * A Mapbox Studio style, if the app's own palette is built there. Unset,
     * Mapbox's light and dark streets styles are used.
     */
    NEXT_PUBLIC_MAPBOX_STYLE_LIGHT: z
      .string()
      .startsWith("mapbox://styles/")
      .optional(),
    NEXT_PUBLIC_MAPBOX_STYLE_DARK: z
      .string()
      .startsWith("mapbox://styles/")
      .optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    NEXT_PUBLIC_MAPBOX_STYLE_LIGHT: process.env.NEXT_PUBLIC_MAPBOX_STYLE_LIGHT,
    NEXT_PUBLIC_MAPBOX_STYLE_DARK: process.env.NEXT_PUBLIC_MAPBOX_STYLE_DARK,
  },
  // `.env.example` lists every key with an empty value; empty means unset.
  emptyStringAsUndefined: true,
});
