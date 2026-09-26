// How much a place is trusted, and by whom it may be proposed
// (context/architecture.md):
//
//   curated  — hand-verified. What a generated itinerary prefers.
//   verified — passed the programmatic gate with a second signal. Generation
//              fills in from these while curation is incomplete, and the judge
//              may propose one, so an intervention can suggest a nearby café.
//   raw      — everything else the gate kept. Searchable, never proposable.

export const placeTiers = ["curated", "verified", "raw"] as const;
export type PlaceTier = (typeof placeTiers)[number];
