import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The environment, validated. `next.config.ts` imports this file, so a build
// with a missing or malformed variable fails before it deploys rather than
// shipping a page that quietly does less.

export const env = createEnv({
  server: {
    /**
     * The key for the Routes API (src/infra/google-routes.ts). Server-only and
     * restricted to that one API; the browser never sees it. Unset, route
     * requests answer "not configured" and the map shows stops without a road.
     */
    GOOGLE_MAPS_ROUTES_API_KEY: z.string().min(1).optional(),
    /**
     * What the Routes proxy will spend (src/bll/route.ts). Each count is Routes
     * requests, the billable unit. These stop requests; a Google budget alert
     * only sends an email.
     */
    ROUTES_USER_PER_MINUTE: z.coerce.number().int().positive().optional(),
    ROUTES_USER_PER_DAY: z.coerce.number().int().positive().optional(),
    ROUTES_GLOBAL_PER_DAY: z.coerce.number().int().positive().optional(),
  },
  client: {
    /**
     * The Maps JavaScript API key, for the browser: restricted to that API and
     * to this app's origins in Google Cloud. Inlined when the client is built,
     * so it is required on Vercel; a local checkout may leave it out and gets
     * the ground colour and the itinerary list instead of a map.
     */
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.VERCEL
      ? z.string().min(1)
      : z.string().min(1).optional(),
    /**
     * The cloud-styled Map ID (Google Cloud → Map Management), which Advanced
     * Markers and the dark colour scheme need. Unset locally, Google's
     * DEMO_MAP_ID stands in; a deploy must have its own.
     */
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: process.env.VERCEL
      ? z.string().min(1)
      : z.string().min(1).optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
  },
  // `.env.example` lists every key with an empty value; empty means unset.
  emptyStringAsUndefined: true,
});
