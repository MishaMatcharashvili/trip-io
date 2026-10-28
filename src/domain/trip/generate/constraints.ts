import { z } from "zod";
import { destinationSlugs, MAX_PLACES } from "../../catalogue/destinations.ts";
import { paces } from "../document.ts";

// What the traveller asks for on /new. No IO and no Node built-ins: the browser
// imports this schema too. The warm-start cache key made from it is in
// cache-key.ts.

export const interests = ["heritage", "nature", "culture", "food"] as const;
export type Interest = (typeof interests)[number];

export const NOTES_MAX_CHARS = 500;

/** Where trips start and finish unless the traveller says otherwise: the capital, where most of them land. */
export const DEFAULT_ENDPOINT = "tbilisi";

/**
 * When a day's plans end unless the traveller says otherwise. A day is a full
 * day: dinner included, not a morning and an early afternoon. The drive home
 * may run past it (schedule.ts says how far).
 */
export const DEFAULT_DAY_ENDS = "20:00";
/** The earliest and latest a traveller may ask their days to end. */
export const DAY_ENDS_RANGE = ["16:00", "23:00"] as const;

/** "HH:MM" on the half hour, inside DAY_ENDS_RANGE. */
export const dayEnds = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|30)$/, "expected HH:MM on the half hour")
  .refine((t) => t >= DAY_ENDS_RANGE[0] && t <= DAY_ENDS_RANGE[1], {
    message: `expected between ${DAY_ENDS_RANGE[0]} and ${DAY_ENDS_RANGE[1]}`,
  });

export const constraints = z.object({
  startDate: z.iso.date(),
  days: z.number().int().min(1).max(21),
  /**
   * Destinations (src/domain/catalogue/destinations.ts) the trip visits, in
   * the order it visits them. Each needs a day of its own; where the trip
   * starts and finishes is `start` and `finish`.
   */
  places: z.array(z.enum(destinationSlugs)).min(1).max(MAX_PLACES),
  /**
   * Where the traveller arrives and where they leave from. Tbilisi unless they
   * say otherwise, and neither is a stop: a start or a finish that is not also
   * in `places` is a drive, not a day.
   */
  start: z.enum(destinationSlugs).default(DEFAULT_ENDPOINT),
  finish: z.enum(destinationSlugs).default(DEFAULT_ENDPOINT),
  pace: z.enum(paces),
  /** When each day's plans end ("back by six"); 20:00 unless said otherwise. */
  dayEnds: dayEnds.default(DEFAULT_DAY_ENDS),
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
 * Everywhere the trip goes, in order: where it starts, the places it visits,
 * where it finishes. A place named twice running is one place, so a trip that
 * starts in Tbilisi and visits Tbilisi first does not drive from Tbilisi to
 * Tbilisi.
 */
export const routeOf = (
  c: Pick<Constraints, "start" | "places" | "finish">,
): string[] =>
  [c.start, ...c.places, c.finish].filter(
    (slug, i, all) => slug !== all[i - 1],
  );

/**
 * Bumped whenever the prompt or the plan schema changes, so cached plans from
 * an older prompt are never served.
 */
export const PROMPT_VERSION = 10;
