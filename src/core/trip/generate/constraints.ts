import { createHash } from "node:crypto";
import { z } from "zod";
import { focusAreaSlugs } from "../../catalogue/focus-areas.ts";
import { paces } from "../document.ts";

// What the traveller asks for on /new. Also the input to the warm-start cache
// key, which deliberately forgets the details that don't change the plan's
// shape (exact dates, exact budget).

export const interests = ["heritage", "nature", "culture", "food"] as const;
export type Interest = (typeof interests)[number];

export const constraints = z.object({
  startDate: z.iso.date(),
  days: z.number().int().min(1).max(21),
  areas: z.array(z.enum(focusAreaSlugs)).min(1).max(4),
  pace: z.enum(paces),
  interests: z.array(z.enum(interests)).max(interests.length),
  party: z.object({
    adults: z.number().int().min(1).max(12),
    children: z.number().int().min(0).max(12),
  }),
  mobility: z.enum(["low", "moderate", "high"]),
  /** Excluding flights, for the whole party and the whole trip. */
  budgetEur: z.number().int().min(0).max(100_000),
});
export type Constraints = z.infer<typeof constraints>;

/**
 * Bumped whenever the prompt or the plan schema changes, so cached plans from
 * an older prompt are never served.
 */
export const PROMPT_VERSION = 1;

const partyKind = ({ adults, children }: Constraints["party"]) =>
  children > 0
    ? "family"
    : adults === 1
      ? "solo"
      : adults === 2
        ? "couple"
        : "group";

function budgetBand(c: Constraints) {
  const perPersonDay =
    c.budgetEur / c.days / (c.party.adults + c.party.children);
  return perPersonDay < 40 ? "low" : perPersonDay < 100 ? "mid" : "high";
}

/**
 * The coarse constraint hash. Two requests with the same key should be happy
 * with the same places in the same order; the scheduler re-times a cached plan
 * against the real dates, so dates only contribute their month (season).
 */
export function cacheKey(c: Constraints): string {
  const shape = {
    v: PROMPT_VERSION,
    areas: [...c.areas].sort(),
    days: c.days,
    pace: c.pace,
    interests: [...c.interests].sort(),
    party: partyKind(c.party),
    mobility: c.mobility,
    month: Number(c.startDate.slice(5, 7)),
    budget: budgetBand(c),
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}
