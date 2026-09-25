import { Hono } from "hono";
import { z } from "zod";
import { openBriefing } from "@/bll/briefing.ts";

// Two ways to say the same thing: this briefing was read.
//
// Neither is behind a session, deliberately. The pixel is fetched by a mail
// client that carries no cookie of ours and often no cookie at all, and the
// in-app ping is the same capability by a different route. What a caller can do
// with a briefing id is set one timestamp to now, once — it reads nothing back,
// and `markOpened` refuses to overwrite an earlier open, so the worst a guessed
// id buys is a false positive in a metric.
//
// That metric is a kill criterion — briefings opened per trip-day, continue
// above 50%, stop below 20% — so it is worth measuring honestly and worth not
// putting a login wall in front of.

/**
 * The smallest valid GIF: one transparent pixel, 43 bytes. Inline rather than a
 * file on disk because a cron-deployed serverless function should not depend on
 * a static asset resolving from its bundle.
 */
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

/** Never cached: a cached pixel is an open that only ever counts once, on one device. */
const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
  pragma: "no-cache",
} as const;

/**
 * Briefing ids are uuids, and Postgres answers a malformed one with a type
 * error rather than an empty result — so the id is checked here, where a
 * mangled link can be an unknown briefing instead of a 500.
 */
const isId = (id: string) => z.uuid().safeParse(id).success;

export const briefings = new Hono()
  .get("/:id/opened.gif", async (c) => {
    // The result is ignored on purpose. An unknown id still gets a pixel: an
    // email that renders a broken image because a row was deleted is a worse
    // outcome than an unrecorded open.
    const id = c.req.param("id");
    if (isId(id)) await openBriefing(id).catch(() => false);
    return c.body(PIXEL, 200, {
      ...NO_STORE,
      "content-type": "image/gif",
      "content-length": String(PIXEL.length),
    });
  })

  .post("/:id/opened", async (c) => {
    const id = c.req.param("id");
    const found = isId(id) && (await openBriefing(id));
    return found ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });
