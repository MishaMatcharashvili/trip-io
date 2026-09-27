import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// The environment, validated. `next.config.ts` imports this file, so a build
// with a missing or malformed variable fails before it deploys rather than
// shipping a page that quietly does less.

export const env = createEnv({
  client: {
    /**
     * The Blob store's `/map` prefix: tiles, fonts, sprites and MapLibre's
     * worker (src/ui/map/source.ts). NEXT_PUBLIC_ values are inlined when the
     * client is built, so a deploy without it has maps that can never load.
     * Required on Vercel; a local checkout may leave it out and gets the
     * ground colour instead of a map.
     */
    NEXT_PUBLIC_MAP_BASE_URL: process.env.VERCEL ? z.url() : z.url().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_MAP_BASE_URL: process.env.NEXT_PUBLIC_MAP_BASE_URL,
  },
  // `.env.example` lists every key with an empty value; empty means unset.
  emptyStringAsUndefined: true,
});
