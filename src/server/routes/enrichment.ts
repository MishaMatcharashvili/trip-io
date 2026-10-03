import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  DEFAULT_CONTENT_TTL_S,
  defaultLimits,
  enrichPlace,
} from "@/bll/place-enrichment.ts";
import { photosForPlace } from "@/bll/place-photos.ts";
import type {
  EnrichFailure,
  PlaceEnricher,
} from "@/domain/catalogue/enrichment.ts";
import { googlePlaces } from "@/infra/google-places.ts";
import { tripadvisor } from "@/infra/tripadvisor.ts";
import { upstashContent } from "@/infra/upstash.ts";
import { wikimediaPhotos } from "@/infra/wikimedia.ts";
import { env } from "@/lib/env.ts";
import { requireSession, type SessionEnv } from "../auth.ts";

// A place's rating, reviews and photos. Validation, status codes and nothing
// else; the rules on spending are in src/bll/place-enrichment.ts.
//
// Two sources are asked of, Tripadvisor and Google (`?source=`), under their own
// terms, limits and bills. Three things here come from those terms, not from taste:
//   * Both forbid keeping what they return, so the response says `no-store` to
//     every browser and CDN between here and the screen. What is kept is kept
//     on purpose, server-side, in Redis, for a bounded time (see
//     docs/tripadvisor.md, which says plainly that this goes against the
//     letter of its caching policy). Both are the owner's decisions,
//     Tripadvisor's for 12 hours and Google's for 60 days.
//   * Reviews must not be in a page's source, so they are fetched from here by
//     script, and /api is disallowed in robots.txt (src/app/robots.ts).
//   * It spends money, so it asks for a session. Public search and logos
//     under the same path do not.

/** What each failure is, as the status the client acts on. */
const status = {
  // Not failures: there is nothing to show, and the screen says nothing.
  "not-configured": 200,
  "no-match": 200,
  "rate-limited": 429,
  quota: 503,
  // Our credential or the provider, not the traveller's doing.
  auth: 502,
  timeout: 504,
  upstream: 502,
  malformed: 502,
} as const satisfies Record<EnrichFailure, number>;

// Without Redis nothing is kept and every visit asks the provider. One store per
// provider: their answers for a place are separate entries, with separate lifetimes.
const keptFor = (provider: string) =>
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? upstashContent({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
        provider,
      })
    : undefined;

/** How long Google's answer is kept unless told otherwise: 60 days, the owner's decision of 2026-10-03. */
const GOOGLE_CONTENT_TTL_S = 60 * 86_400;

/** The review sources a place can be asked of, each with its own terms and bill. */
const sources = ["tripadvisor", "google"] as const;
type Source = (typeof sources)[number];

type SourceConfig = {
  provider: PlaceEnricher;
  kept: ReturnType<typeof keptFor>;
  contentTtlSeconds: number;
  limits: typeof defaultLimits;
};

const config: Record<Source, SourceConfig> = {
  tripadvisor: {
    provider: tripadvisor({ key: env.TRIPADVISOR_API_KEY }),
    kept: keptFor("tripadvisor"),
    contentTtlSeconds: env.TRIPADVISOR_CONTENT_TTL_S ?? DEFAULT_CONTENT_TTL_S,
    limits: {
      ...defaultLimits,
      userPerDay: env.TRIPADVISOR_USER_PER_DAY ?? defaultLimits.userPerDay,
      globalPerDay:
        env.TRIPADVISOR_GLOBAL_PER_DAY ?? defaultLimits.globalPerDay,
    },
  },
  google: {
    provider: googlePlaces({ key: env.GOOGLE_PLACES_API_KEY }),
    // Kept for 60 days, on the owner's decision. Google's terms allow storing a
    // place's identifier and, as read, nothing it says about it: like
    // Tripadvisor's, this departs from the letter (docs/google-places.md).
    kept: keptFor("google"),
    contentTtlSeconds: env.GOOGLE_PLACES_CONTENT_TTL_S ?? GOOGLE_CONTENT_TTL_S,
    // Tighter than Tripadvisor's: a place opened for the first time is a Details
    // call and up to six photograph calls, billed. One served from Redis is free.
    limits: {
      ...defaultLimits,
      userPerDay: env.GOOGLE_PLACES_USER_PER_DAY ?? 30,
      globalPerDay: env.GOOGLE_PLACES_GLOBAL_PER_DAY ?? 200,
    },
  },
};

/**
 * A failure inside the use case (a database that is missing a table, a provider
 * that threw) is a reason the screen can show, not a 500 with no body: the panel
 * reads the answer as JSON, and an HTML error page made every such failure look
 * like a network problem. What went wrong is logged by name, never with a message
 * that could carry a credential.
 */
function failed(error: unknown, what: string) {
  console.error(
    JSON.stringify({
      category: `places.${what}`,
      result: "error",
      error: error instanceof Error ? error.name : "unknown",
    }),
  );
  return { ok: false as const, reason: "upstream" as const };
}

const photoSource = wikimediaPhotos();

export const enrichment = new Hono<SessionEnv>()
  .get(
    "/:id/photos",
    requireSession,
    zValidator("param", z.object({ id: z.uuid() })),
    async (c) => {
      let outcome: Awaited<ReturnType<typeof photosForPlace>>;
      try {
        outcome = await photosForPlace(
          c.req.valid("param").id,
          c.get("userId"),
          { source: photoSource },
        );
      } catch (error) {
        outcome = failed(error, "photos");
      }
      // Freely licensed and not the traveller's own, so the browser may keep it
      // for a day; private, because the route is behind a session.
      c.header(
        "Cache-Control",
        outcome.ok ? "private, max-age=86400" : "no-store",
      );
      if (outcome.ok) return c.json(outcome, 200);
      return c.json(outcome, outcome.reason === "rate-limited" ? 429 : 502);
    },
  )
  .get(
    "/:id/enrichment",
    requireSession,
    zValidator("param", z.object({ id: z.uuid() })),
    // Which source to ask. Tripadvisor when it is not said, as before there
    // was a second.
    zValidator(
      "query",
      z.object({ source: z.enum(sources).default("tripadvisor") }),
    ),
    async (c) => {
      let outcome: Awaited<ReturnType<typeof enrichPlace>>;
      try {
        outcome = await enrichPlace(
          c.req.valid("param").id,
          c.get("userId"),
          config[c.req.valid("query").source],
        );
      } catch (error) {
        outcome = failed(error, "enrich");
      }
      c.header("Cache-Control", "no-store");
      c.header("X-Robots-Tag", "noindex, nofollow");
      return outcome.ok
        ? c.json(outcome, 200)
        : c.json(outcome, status[outcome.reason]);
    },
  );
