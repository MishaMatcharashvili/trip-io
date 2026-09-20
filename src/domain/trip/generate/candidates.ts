import {
  type OpeningHours,
  summariseHours,
} from "../../catalogue/opening-hours.ts";

// What the model may choose from, and how a candidate is described to it.
// Retrieval is the data layer's job (src/dal/places.ts); the numbers and wording
// here are the prompt's, so they live with the rest of the planning model.

/** Enough for a two-week trip without flooding the prompt. */
export const CANDIDATE_LIMIT = 150;

/** Never fewer than this per area, however many areas were asked for. */
export const CANDIDATES_PER_AREA_MIN = 20;

/** The hours line the model sees; unknown hours are said to be unknown. */
export const describeHours = (c: { openingHours: OpeningHours | null }) =>
  c.openingHours ? summariseHours(c.openingHours) : "hours unknown";
