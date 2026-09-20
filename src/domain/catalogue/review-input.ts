import { z } from "zod";
import { GEORGIA_BBOX } from "../geo.ts";
import { allowedCategories } from "./categories.ts";
import { openingHours } from "./opening-hours.ts";

// Request bodies for the curation API. Kept apart from curation.ts (which
// imports the db client) so the browser form can validate with the same schema.

export const placeInput = z.object({
  name: z.string().trim().min(1).max(200),
  nameKa: z.string().trim().max(200).nullable(),
  category: z.enum(allowedCategories as [string, ...string[]]),
  lon: z.number().min(GEORGIA_BBOX.west).max(GEORGIA_BBOX.east),
  lat: z.number().min(GEORGIA_BBOX.south).max(GEORGIA_BBOX.north),
  // Required: detector 5 and the coherent-day validator depend on it, and no
  // source other than this pass will ever provide it. If it can't be found out,
  // skip the place instead.
  openingHours,
  note: z.string().trim().max(1000).optional(),
});
export type PlaceInput = z.infer<typeof placeInput>;

export const reviewInput = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("curate"), place: placeInput }),
  z.object({
    decision: z.literal("reject"),
    note: z.string().trim().max(1000).optional(),
  }),
  z.object({
    decision: z.literal("skip"),
    note: z.string().trim().max(1000).optional(),
  }),
]);
export type ReviewInput = z.infer<typeof reviewInput>;
