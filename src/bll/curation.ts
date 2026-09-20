import {
  curateExisting,
  insertCurated,
  placeExists,
  type QueueRow,
  recordDecision,
  reviewCounts,
  reviewQueue,
} from "../dal/places.ts";
import {
  type CategoryGroup,
  categoryGroups,
} from "../domain/catalogue/categories.ts";
import {
  areaBySlug,
  type FocusAreaSlug,
  focusAreas,
} from "../domain/catalogue/focus-areas.ts";
import type {
  PlaceInput,
  ReviewInput,
} from "../domain/catalogue/review-input.ts";

// The hand-verification queue behind /curate: which place a curator is shown
// next, and what a decision does. The SQL is in src/dal/places.ts; what is
// decided here is the order of the work and the meaning of each decision.

export type { QueueRow as QueuePlace };

// Heritage and nature first: they're what itineraries are built around, and
// they're scarcest in Overture. Lodging last: plentiful, and rarely a trip node.
const queueOrder: CategoryGroup[] = [
  "heritage",
  "nature",
  "culture",
  "food",
  "transport",
  "lodging",
];

const ranked = queueOrder.map((group) => categoryGroups[group]);

export function getQueue({
  area,
  group,
  limit = 20,
}: {
  area: FocusAreaSlug;
  group?: CategoryGroup;
  limit?: number;
}) {
  return reviewQueue({
    area: areaBySlug(area).match,
    categories: group ? categoryGroups[group] : undefined,
    rank: ranked,
    limit,
  });
}

export type AreaProgress = {
  slug: FocusAreaSlug;
  name: string;
  target: number;
  curated: number;
  pending: number;
};

/** Verification progress per focus area: the target is the domain's, the counts the catalogue's. */
export async function getProgress(): Promise<AreaProgress[]> {
  return Promise.all(
    focusAreas.map(async (area) => ({
      slug: area.slug,
      name: area.name,
      target: area.target,
      ...(await reviewCounts(area.match)),
    })),
  );
}

/** Returns false when the place doesn't exist. */
export async function reviewPlace(
  placeId: string,
  input: ReviewInput,
  reviewerId: string,
): Promise<boolean> {
  if (!(await placeExists(placeId))) return false;

  if (input.decision === "curate") {
    await curateExisting(placeId, input.place, reviewerId);
  } else {
    await recordDecision(placeId, input.decision, reviewerId, input.note);
  }
  return true;
}

/** A place Overture doesn't have. Goes straight to the curated tier. */
export function addPlace(
  input: PlaceInput,
  reviewerId: string,
): Promise<string> {
  return insertCurated(input, reviewerId);
}
