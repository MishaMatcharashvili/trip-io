import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  DEFAULT_CONTENT_TTL_S,
  defaultLimits,
  enrichPlace,
} from "@/bll/place-enrichment.ts";
import { photosForPlace } from "@/bll/place-photos.ts";
import type { EnrichFailure } from "@/domain/catalogue/enrichment.ts";
import { tripadvisor } from "@/infra/tripadvisor.ts";
import { upstashContent } from "@/infra/upstash.ts";
import { wikimediaPhotos } from "@/infra/wikimedia.ts";
import { env } from "@/lib/env.ts";
import { requireSession, type SessionEnv } from "../auth.ts";

// A place's rating, reviews and photos. Validation, status codes and nothing
// else; the rules on spending are in src/bll/place-enrichment.ts.
//
// Three things here come from the provider's terms, not from taste:
//   * It forbids keeping what it returns, so the response says `no-store` to
//     every browser and CDN between here and the screen. What is kept is kept
//     on purpose, server-side, in Redis, for a bounded time (see
//     docs/tripadvisor.md, which says plainly that this goes against the
//     letter of its caching policy).
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

const provider = tripadvisor({ key: env.TRIPADVISOR_API_KEY });

// Without Redis nothing is kept and every visit asks the provider.
const kept =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? upstashContent({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : undefined;

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
    async (c) => {
      let outcome: Awaited<ReturnType<typeof enrichPlace>>;
      try {
        outcome = await enrichPlace(c.req.valid("param").id, c.get("userId"), {
          provider,
          kept,
          contentTtlSeconds:
            env.TRIPADVISOR_CONTENT_TTL_S ?? DEFAULT_CONTENT_TTL_S,
          limits: {
            ...defaultLimits,
            userPerDay:
              env.TRIPADVISOR_USER_PER_DAY ?? defaultLimits.userPerDay,
            globalPerDay:
              env.TRIPADVISOR_GLOBAL_PER_DAY ?? defaultLimits.globalPerDay,
          },
        });
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
