import { z } from "zod";
import { destinationSlugs, MAX_PLACES } from "../../catalogue/destinations.ts";
import { paces } from "../document.ts";

// What the traveller asks for on /new. No IO and no Node built-ins: the browser
// imports this schema too. The warm-start cache key made from it is in
// cache-key.ts.

export const interests = ["heritage", "nature", "culture", "food"] as const;
export type Interest = (typeof interests)[number];

export const NOTES_MAX_CHARS = 500;

export const constraints = z.object({
  startDate: z.iso.date(),
  days: z.number().int().min(1).max(21),
  /**
   * Destinations (src/domain/catalogue/destinations.ts) in the order they are
   * travelled: the first is where the trip starts, the last where it ends. A
   * round trip names its start again at the end.
   */
  places: z.array(z.enum(destinationSlugs)).min(1).max(MAX_PLACES),
  pace: z.enum(paces),
  interests: z.array(z.enum(interests)).max(interests.length),
  party: z.object({
    adults: z.number().int().min(1).max(12),
    children: z.number().int().min(0).max(12),
  }),
  mobility: z.enum(["low", "moderate", "high"]),
  /** Excluding flights, for the whole party and the whole trip. */
  budgetEur: z.number().int().min(0).max(100_000),
  /**
   * The traveller's wishes the fields above cannot hold ("vegetarian", "no
   * long drives"), in their own words, for the composer.
   */
  notes: z.string().max(NOTES_MAX_CHARS).default(""),
});
export type Constraints = z.infer<typeof constraints>;

/**
 * Bumped whenever the prompt or the plan schema changes, so cached plans from
 * an older prompt are never served.
 */
export const PROMPT_VERSION = 3;
