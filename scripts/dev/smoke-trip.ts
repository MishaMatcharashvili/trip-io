// Exercises the patch log against a real database: create → generate-shaped
// first patch → edit → undo → restore, printing what came back. Run with
// `npm run smoke:trip` once DATABASE_URL points at a migrated database.
//
// It writes a trip owned by no user and deletes it at the end, so it is safe to
// run against a dev branch. It never touches the catalogue.

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  addAllOps,
  appendPatch,
  createTrip,
  docAt,
  restoreTo,
  undoLast,
} from "../../src/bll/trip-document.ts";
import { db } from "../../src/dal/client.ts";
import { loadTrip, patchHistory } from "../../src/dal/trips.ts";
import type { TripDoc, TripNode } from "../../src/domain/trip/document.ts";

const at = (day: string, hhmm: string) =>
  new Date(`${day}T${hhmm}:00+04:00`).toISOString();
const DAY = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

const node = (
  title: string,
  hhmm: string,
  durationMin: number,
  lonLat: [number, number],
): TripNode => ({
  kind: "visit",
  placeId: null,
  lonLat,
  startsAt: at(DAY, hhmm),
  durationMin,
  indoor: false,
  meta: { title, urban: true },
});

const first = randomUUID();
const second = randomUUID();

const header: TripDoc["trip"] = {
  title: "Smoke test",
  startsAt: at(DAY, "00:00"),
  endsAt: at(DAY, "23:59"),
  party: { adults: 1 },
  pace: "moderate",
  budget: "€0",
  prefs: {},
};

const step = (label: string, value: unknown) =>
  console.log(`\n── ${label}\n`, JSON.stringify(value, null, 1));

const tripId = await createTrip(header, null);
console.log("trip", tripId);

// 1. The first patch. Authored as the traveller, with placeless stops: a
// system-authored plan may only use curated catalogue places, and there are
// none yet.
const plan: TripDoc = {
  trip: header,
  nodes: {
    [first]: node("Narikala fortress", "10:00", 90, [44.7217, 41.6879]),
    [second]: node("Botanical garden", "12:30", 120, [44.7075, 41.6873]),
  },
};
const created = await appendPatch({
  tripId,
  parentId: null,
  intent: "Hand-built plan",
  ops: addAllOps(plan),
  author: "user",
  meta: { source: "smoke" },
});
step(
  "first patch",
  created.ok ? { seq: created.seq, head: created.patchId } : created,
);
if (!created.ok) process.exit(1);

// 2. A user edit against the current head.
const edited = await appendPatch({
  tripId,
  parentId: created.patchId,
  intent: "Start later",
  ops: [
    {
      op: "replace",
      path: `/nodes/${first}/startsAt`,
      value: at(DAY, "11:00"),
    },
  ],
  author: "user",
  clientSeq: 1,
});
step(
  "user edit",
  edited.ok
    ? {
        seq: edited.seq,
        startsAt: edited.doc.nodes[first].startsAt,
        warnings: edited.introduced,
      }
    : edited,
);

// 3. A stale write must be refused.
const stale = await appendPatch({
  tripId,
  parentId: created.patchId,
  intent: "Stale write",
  ops: [{ op: "replace", path: `/nodes/${first}/durationMin`, value: 30 }],
  author: "user",
});
step("stale write (expect code 'stale')", stale.ok ? stale : stale.code);

// 4. Undo, then restore to the first patch.
const undone = await undoLast(tripId, null);
step(
  "undo",
  undone.ok
    ? { seq: undone.seq, startsAt: undone.doc.nodes[first].startsAt }
    : undone,
);
const restored = await restoreTo(tripId, created.patchId, null);
step("restore", restored.ok ? { seq: restored.seq } : { code: restored.code });

step("history", await patchHistory(tripId));
const head = await loadTrip(tripId);
step(
  "head document",
  Object.values(head?.doc.nodes ?? {}).map(
    (n) => `${n.startsAt} ${n.meta.title}`,
  ),
);
step(
  "document at the first patch",
  Object.keys((await docAt(tripId, created.patchId))?.nodes ?? {}).length,
);

// The projection must match the document exactly — that's the invariant the
// Phase 3 match query depends on.
const projected = await db.execute(
  sql`SELECT id, starts_at, ST_AsText(geom::geometry) AS point FROM trip_node WHERE trip_id = ${tripId}`,
);
step("trip_node rows", projected.rows);

// The watch is derived from that same projection, in the same transaction:
// a trip is never watched somewhere it does not go.
const watch = await db.execute(
  sql`SELECT active_from, active_to, channels, quiet_hours, cap,
             round(ST_Area(regions) / 1e6)::int AS footprint_km2
      FROM trip_watch WHERE trip_id = ${tripId}`,
);
step("trip_watch row", watch.rows);

await db.execute(sql`DELETE FROM trip WHERE id = ${tripId}`);
console.log("\ncleaned up");
