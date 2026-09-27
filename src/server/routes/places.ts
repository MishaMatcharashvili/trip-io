import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { placeLogo, searchCatalogue } from "@/bll/places";
import { categoryGroups } from "@/domain/catalogue/categories";
import { focusAreaSlugs } from "@/domain/catalogue/focus-areas";

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

export const places = new Hono()
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
