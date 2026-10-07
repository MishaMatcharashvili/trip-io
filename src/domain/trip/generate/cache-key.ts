import { createHash } from "node:crypto";
import { type Constraints, PROMPT_VERSION } from "./constraints.ts";

// The warm-start cache key, which deliberately forgets the details that don't
// change the plan's shape (exact dates, exact budget).

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
    // Wishes change which places suit, so a plan composed for other wishes
    // is never served for these.
    notes: c.notes.trim().toLowerCase().replace(/\s+/g, " "),
  };
  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}
