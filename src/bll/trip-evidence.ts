import { candidatesByIds } from "../dal/places.ts";
import { generationsFor } from "../dal/plans.ts";
import { placeIdsOf } from "../domain/trip/document.ts";
import type { PlaceFacts } from "../domain/trip/eval/checks.ts";
import { tripView } from "./trip-document.ts";

// A built trip as evidence: the document at head with what the validator says
// of it, how the plan was made, attempt by attempt, and where each place in it
// is. For `pnpm planner:eval -- --trip <id>`, when a traveller reports a trip
// that came out wrong and the eval needs to start from what they got.

export async function tripEvidence(tripId: string) {
  const view = await tripView(tripId);
  if (!view) return null;
  const ids = placeIdsOf(view.doc);
  const [generations, found] = await Promise.all([
    generationsFor(tripId),
    candidatesByIds(ids),
  ]);
  const places: Record<string, PlaceFacts> = Object.fromEntries(
    found.map((c) => [
      c.id,
      { name: c.name, category: c.category, lonLat: c.lonLat },
    ]),
  );
  return { doc: view.doc, violations: view.violations, generations, places };
}
