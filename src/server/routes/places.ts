import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { searchCatalogue } from "@/bll/places";
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

export const places = new Hono().get(
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
