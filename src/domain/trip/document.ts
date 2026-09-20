import { z } from "zod";
import type { LonLat } from "../geo.ts";

// The trip document: what a patch applies to and what a checkpoint snapshots.
// `trip_node` rows are a projection of the head document, kept in sync by the
// store in the same transaction as the patch that changed them.
//
// Nodes are keyed by id, never held in an array: a JSON Patch path into an array
// (`/nodes/3`) points at a different node as soon as anything is inserted before
// it, and a proposal computed against yesterday's plan would silently edit the
// wrong stop. Order always comes from `startsAt`.

const isoInstant = z.iso.datetime({ offset: true });

const lonLat = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);

export const nodeKinds = ["visit", "meal", "transfer", "stay"] as const;
export type NodeKind = (typeof nodeKinds)[number];

export const nodeMeta = z.object({
  title: z.string().min(1).max(200),
  note: z.string().max(1000).optional(),
  booked: z.boolean().optional(),
  // Set on transfers that run along one of the 12 curated corridors; the road
  // detector (Phase 5) matches corridor events through it.
  corridorSlug: z.string().optional(),
  // Inside a city. Urban transfers are exempt from the darkness rule: driving
  // across Tbilisi after dusk is fine, driving the Military Road isn't.
  urban: z.boolean(),
});

// - visit, meal: the itinerary itself.
// - transfer: an explicit drive between bases. Required when a leg takes longer
//   than IMPLICIT_LEG_MAX_MIN; shorter hops are the gap between nodes. Its
//   location is the destination.
// - stay: check-in at the night's base. The base for any moment is the latest
//   stay that started at or before it, so a multi-night base is one stay node.
export const tripNode = z
  .object({
    kind: z.enum(nodeKinds),
    placeId: z.uuid().nullable(),
    // Only for placeless nodes. A node with a place is located by the place's
    // geometry on the server, never by anything a client or model sends.
    lonLat: lonLat.nullable(),
    startsAt: isoInstant,
    durationMin: z
      .number()
      .int()
      .min(0)
      .max(24 * 60),
    indoor: z.boolean(),
    meta: nodeMeta,
  })
  .refine(
    (n) => (n.placeId === null) !== (n.lonLat === null),
    "a node has either a placeId or a lonLat, not both",
  );
export type TripNode = z.infer<typeof tripNode>;

export const paces = ["relaxed", "moderate", "packed"] as const;
export type Pace = (typeof paces)[number];

export const tripHeader = z
  .object({
    title: z.string().min(1).max(200),
    startsAt: isoInstant,
    endsAt: isoInstant,
    party: z.record(z.string(), z.unknown()),
    pace: z.enum(paces),
    budget: z.string(),
    prefs: z.record(z.string(), z.unknown()),
  })
  .refine((t) => Date.parse(t.startsAt) < Date.parse(t.endsAt), {
    message: "trip ends before it starts",
  });
export type TripHeader = z.infer<typeof tripHeader>;

export type TripDoc = {
  trip: TripHeader;
  nodes: Record<string, TripNode>;
};

export const tripDoc = z.object({
  trip: tripHeader,
  nodes: z.record(z.uuid(), tripNode),
});

export const nodeEnd = (n: TripNode) =>
  Date.parse(n.startsAt) + n.durationMin * 60_000;

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tbilisi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Tbilisi calendar date an instant falls on, as YYYY-MM-DD. */
export function dayKey(instant: string | number | Date): string {
  return dayFormat.format(new Date(instant));
}

export type NodeEntry = { id: string; node: TripNode };

/** Nodes in time order. Ties break on id so the order is deterministic. */
export function sortedNodes(nodes: Record<string, TripNode>): NodeEntry[] {
  return Object.entries(nodes)
    .map(([id, node]) => ({ id, node }))
    .sort(
      (a, b) =>
        Date.parse(a.node.startsAt) - Date.parse(b.node.startsAt) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
}

export function daysOf(doc: TripDoc): string[] {
  return [
    ...new Set(Object.values(doc.nodes).map((n) => dayKey(n.startsAt))),
  ].sort();
}

/**
 * Where a node is. Places are looked up rather than stored on the node, so the
 * document never holds geometry that could disagree with the catalogue, and a
 * patch that swaps `placeId` needs no second op to move the pin.
 */
export function locate(
  node: TripNode,
  places: ReadonlyMap<string, { lonLat: LonLat }>,
): LonLat | null {
  if (node.placeId === null) return node.lonLat as LonLat;
  return places.get(node.placeId)?.lonLat ?? null;
}

/** Structural equality over JSON values (what a document is made of). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter(
    (k) => (a as Record<string, unknown>)[k] !== undefined,
  );
  const kb = Object.keys(b).filter(
    (k) => (b as Record<string, unknown>)[k] !== undefined,
  );
  return (
    ka.length === kb.length &&
    ka.every((k) =>
      jsonEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      ),
    )
  );
}

/** Every catalogue place the document refers to, without repeats. */
export function placeIdsOf(doc: TripDoc): string[] {
  return [
    ...new Set(
      Object.values(doc.nodes)
        .map((n) => n.placeId)
        .filter((id): id is string => id !== null),
    ),
  ];
}
