import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { submitHoursReport } from "@/bll/hours-report";
import { catalogueByArea, placeLogo, searchCatalogue } from "@/bll/places";
import { categoryGroups } from "@/domain/catalogue/categories";
import { focusAreaSlugs, focusAreas } from "@/domain/catalogue/focus-areas";
import { roadSeason } from "@/domain/catalogue/road-season";
import { getAuth } from "@/infra/auth";
import { isCurator } from "@/lib/curator";

// The catalogue, read-only and public: adding a stop searches it, Explore
// browses it. Nothing here is anyone's own data.

const groups = Object.keys(categoryGroups) as [
  keyof typeof categoryGroups,
  ...(keyof typeof categoryGroups)[],
];

const lonLat = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, "expected lon,lat")
  .transform((s) => s.split(",").map(Number) as [number, number]);

/** A logo rarely changes; a place without one should not be asked again soon. */
const LOGO_CACHE =
  "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";
const NO_LOGO_CACHE = "public, max-age=86400, s-maxage=86400";

/** The month in Tbilisi, 1 to 12, and its name. */
const tbilisiMonth = (now: Date) => ({
  month: Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tbilisi",
      month: "numeric",
    }).format(now),
  ),
  monthName: new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    month: "long",
  }).format(now),
});

export const places = new Hono()
  // What Explore opens on before anything is searched: the regions with what
  // each holds, and what the season says about the roads to them.
  .get("/overview", async (c) => {
    const counts = await catalogueByArea();
    const { month, monthName } = tbilisiMonth(new Date());
    return c.json({
      areas: focusAreas.map(({ slug, name }) => {
        const held = counts.find((a) => a.slug === slug);
        return {
          slug,
          name,
          curated: held?.curated ?? 0,
          verified: held?.verified ?? 0,
        };
      }),
      monthName,
      roads: roadSeason(month),
    });
  })
  .get(
    "/:id/logo",
    zValidator("param", z.object({ id: z.uuid() })),
    async (c) => {
      const logo = await placeLogo(c.req.valid("param").id);
      if (!logo) {
        c.header("Cache-Control", NO_LOGO_CACHE);
        return c.body(null, 404);
      }
      return c.body(logo.bytes, 200, {
        "Content-Type": logo.contentType,
        "Cache-Control": LOGO_CACHE,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      });
    },
  )
  // Detector #5: "this place is shut on this day". A signed-in account is
  // required and an anonymous session is not enough — two reports from two
  // throwaway sessions would publish a closure, which is what the quorum
  // exists to prevent. A curator's report publishes alone.
  .post(
    "/:id/closed",
    zValidator("param", z.object({ id: z.uuid() })),
    zValidator("json", z.object({ date: z.string() })),
    async (c) => {
      const session = await getAuth().api.getSession({
        headers: c.req.raw.headers,
      });
      if (!session) return c.json({ error: "unauthenticated" }, 401);
      if (session.user.isAnonymous) {
        return c.json({ error: "sign-in-required" }, 403);
      }
      const result = await submitHoursReport(
        { placeId: c.req.valid("param").id, date: c.req.valid("json").date },
        {
          id: session.user.id,
          trust: isCurator(session.user) ? "curator" : "community",
        },
      );
      if (result.ok) return c.json(result);
      return c.json(result, result.reason === "unknown-place" ? 404 : 400);
    },
  )
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        q: z.string().max(100).optional(),
        near: lonLat.optional(),
        area: z.enum(focusAreaSlugs).optional(),
        group: z.enum(groups).optional(),
        limit: z.coerce.number().int().min(1).max(50).optional(),
      }),
    ),
    async (c) => {
      const { group, ...query } = c.req.valid("query");
      return c.json({
        places: await searchCatalogue({
          ...query,
          groups: group ? [group] : undefined,
        }),
      });
    },
  );
