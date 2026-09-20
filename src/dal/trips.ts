import { eq, sql } from "drizzle-orm";
import {
  type TripDoc,
  type TripNode,
  tripHeader,
  tripNode,
} from "../domain/trip/document.ts";
import type { PatchOp } from "../domain/trip/patch.ts";
import type { Author } from "../domain/trip/validate.ts";
import { db, type Queryable } from "./client.ts";
import { trip } from "./schema/index.ts";
import type { Tx } from "./tx.ts";

// The patch log and the node projection that hangs off it, as rows.
//
// `trip_node` rows are always the document at head: the match query (Phase 3)
// joins against them, so they can never drift from the log. Keeping them in step
// is the use case's job (src/bll/trip-document.ts); this module only reads and
// writes.
//
// Reads take the connection last and default it to the HTTP client, so only the
// write path — which must run inside one transaction — has to name one.

type Row = Record<string, unknown>;

export type LoadedTrip = {
  doc: TripDoc;
  headPatchId: string | null;
  seq: number;
  userId: string | null;
};

const rowsToDoc = (trip: Row, nodes: Row[]): TripDoc => ({
  trip: tripHeader.parse({
    title: trip.title,
    startsAt: new Date(trip.starts_at as string).toISOString(),
    endsAt: new Date(trip.ends_at as string).toISOString(),
    party: trip.party,
    pace: trip.pace,
    budget: trip.budget,
    prefs: trip.prefs,
  }),
  nodes: Object.fromEntries(
    nodes.map((n) => [
      n.id as string,
      tripNode.parse({
        kind: n.kind,
        placeId: n.place_id,
        // Geometry is the place's for a placed node; only a placeless node
        // carries its own point (src/domain/trip/document.ts).
        lonLat: n.place_id ? null : [Number(n.lon), Number(n.lat)],
        startsAt: new Date(n.starts_at as string).toISOString(),
        durationMin: n.duration_min,
        indoor: n.indoor,
        meta: n.meta,
      }),
    ]),
  ),
});

export async function loadTrip(
  tripId: string,
  conn: Queryable = db,
): Promise<LoadedTrip | null> {
  const trips = await conn.execute(sql`
    SELECT t.*, COALESCE((SELECT MAX(seq) FROM trip_patch p WHERE p.trip_id = t.id), 0) AS seq
    FROM trip t WHERE t.id = ${tripId}
  `);
  const trip = trips.rows[0];
  if (!trip) return null;

  const nodes = await conn.execute(sql`
    SELECT id, kind, place_id, starts_at, duration_min, indoor, meta,
           ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat
    FROM trip_node WHERE trip_id = ${tripId}
  `);

  return {
    doc: rowsToDoc(trip, nodes.rows),
    headPatchId: (trip.head_patch_id as string | null) ?? null,
    seq: Number(trip.seq),
    userId: (trip.user_id as string | null) ?? null,
  };
}

export type TripRef = {
  headPatchId: string | null;
  userId: string | null;
};

/**
 * Who owns a trip and where its head is, without projecting the document. An
 * ownership check is the first thing every handler does, and most of them go on
 * to do something that loads the document itself.
 */
export async function loadTripRef(tripId: string): Promise<TripRef | null> {
  const rows = await db.execute(
    sql`SELECT user_id, head_patch_id FROM trip WHERE id = ${tripId}`,
  );
  const row = rows.rows[0];
  if (!row) return null;
  return {
    headPatchId: (row.head_patch_id as string | null) ?? null,
    userId: (row.user_id as string | null) ?? null,
  };
}

/** An empty trip. Its first patch — generated or hand-built — follows. */
export async function insertTrip(
  header: TripDoc["trip"],
  userId: string | null,
): Promise<string> {
  const rows = await db.execute(sql`
    INSERT INTO trip (user_id, title, starts_at, ends_at, party, pace, budget, prefs)
    VALUES (${userId}, ${header.title}, ${header.startsAt}, ${header.endsAt},
            ${JSON.stringify(header.party)}::jsonb, ${header.pace}, ${header.budget},
            ${JSON.stringify(header.prefs)}::jsonb)
    RETURNING id
  `);
  return rows.rows[0].id as string;
}

/** Takes the row lock the whole append runs under. Null when there is no such trip. */
export async function lockTrip(
  tx: Tx,
  tripId: string,
): Promise<{ headPatchId: string | null } | null> {
  const locked = await tx.execute(
    sql`SELECT id, head_patch_id FROM trip WHERE id = ${tripId} FOR UPDATE`,
  );
  if (locked.rows.length === 0) return null;
  return {
    headPatchId: (locked.rows[0].head_patch_id as string | null) ?? null,
  };
}

export type PatchRow = {
  tripId: string;
  parentId: string | null;
  intent: string;
  ops: unknown;
  inverseOps: PatchOp[];
  author: Author;
  acceptedBy: string | null;
  seq: number;
  clientSeq: number | null;
  meta: Record<string, unknown>;
};

export async function insertPatch(tx: Tx, row: PatchRow): Promise<string> {
  const inserted = await tx.execute(sql`
    INSERT INTO trip_patch (trip_id, parent_id, intent, ops, inverse_ops, author,
                            accepted_by, seq, client_seq, meta)
    VALUES (${row.tripId}, ${row.parentId}, ${row.intent},
            ${JSON.stringify(row.ops)}::jsonb, ${JSON.stringify(row.inverseOps)}::jsonb,
            ${row.author}, ${row.acceptedBy}, ${row.seq},
            ${row.clientSeq}, ${JSON.stringify(row.meta)}::jsonb)
    RETURNING id
  `);
  return inserted.rows[0].id as string;
}

export async function upsertNode(
  tx: Tx,
  tripId: string,
  id: string,
  node: TripNode,
): Promise<void> {
  const point = node.lonLat
    ? sql`ST_GeogFromText(${`POINT(${node.lonLat[0]} ${node.lonLat[1]})`})`
    : sql`(SELECT p.geom FROM place p WHERE p.id = ${node.placeId})`;
  // Updated in place rather than replaced: `event_match.node_id` cascades on
  // delete, and a moved stop must keep the matches already judged against it.
  await tx.execute(sql`
    INSERT INTO trip_node (id, trip_id, kind, place_id, starts_at, duration_min, indoor, geom, meta)
    VALUES (${id}, ${tripId}, ${node.kind}, ${node.placeId}, ${node.startsAt},
            ${node.durationMin}, ${node.indoor}, ${point}, ${JSON.stringify(node.meta)}::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      kind = EXCLUDED.kind, place_id = EXCLUDED.place_id, starts_at = EXCLUDED.starts_at,
      duration_min = EXCLUDED.duration_min, indoor = EXCLUDED.indoor,
      geom = EXCLUDED.geom, meta = EXCLUDED.meta
  `);
}

export async function deleteNode(
  tx: Tx,
  tripId: string,
  id: string,
): Promise<void> {
  await tx.execute(
    sql`DELETE FROM trip_node WHERE id = ${id} AND trip_id = ${tripId}`,
  );
}

export async function setHead(
  tx: Tx,
  tripId: string,
  patchId: string,
): Promise<void> {
  await tx.execute(
    sql`UPDATE trip SET head_patch_id = ${patchId} WHERE id = ${tripId}`,
  );
}

export async function insertCheckpoint(
  tx: Tx,
  tripId: string,
  patchId: string,
  doc: TripDoc,
): Promise<void> {
  await tx.execute(sql`
    INSERT INTO checkpoint_log (trip_id, patch_id, snapshot)
    VALUES (${tripId}, ${patchId}, ${JSON.stringify(doc)}::jsonb)
    ON CONFLICT (trip_id, patch_id) DO NOTHING
  `);
}

export type PatchRecord = {
  id: string;
  seq: number;
  intent: string;
  author: Author;
  appliedAt: string;
};

export async function patchHistory(
  tripId: string,
  conn: Queryable = db,
): Promise<PatchRecord[]> {
  const rows = await conn.execute(sql`
    SELECT id, seq, intent, author, applied_at FROM trip_patch
    WHERE trip_id = ${tripId} ORDER BY seq DESC
  `);
  return rows.rows.map((r) => ({
    id: r.id as string,
    seq: Number(r.seq),
    intent: r.intent as string,
    author: r.author as Author,
    appliedAt: new Date(r.applied_at as string).toISOString(),
  }));
}

export type HeadPatch = { id: string; intent: string; inverseOps: unknown };

/** The patch at head, with the inverse stored when it was applied. */
export async function loadHeadPatch(tripId: string): Promise<HeadPatch | null> {
  const rows = await db.execute(sql`
    SELECT p.id, p.intent, p.inverse_ops
    FROM trip t JOIN trip_patch p ON p.id = t.head_patch_id
    WHERE t.id = ${tripId}
  `);
  const head = rows.rows[0];
  if (!head) return null;
  return {
    id: head.id as string,
    intent: head.intent as string,
    inverseOps: head.inverse_ops,
  };
}

export async function patchSeq(
  tripId: string,
  patchId: string,
  conn: Queryable = db,
): Promise<number | null> {
  const rows = await conn.execute(
    sql`SELECT seq FROM trip_patch WHERE id = ${patchId} AND trip_id = ${tripId}`,
  );
  return rows.rows.length === 0 ? null : Number(rows.rows[0].seq);
}

/** The latest checkpoint at or before a sequence number. */
export async function checkpointAtOrBefore(
  tripId: string,
  seq: number,
  conn: Queryable = db,
): Promise<{ doc: TripDoc; seq: number } | null> {
  const rows = await conn.execute(sql`
    SELECT c.snapshot, p.seq FROM checkpoint_log c
    JOIN trip_patch p ON p.id = c.patch_id
    WHERE c.trip_id = ${tripId} AND p.seq <= ${seq}
    ORDER BY p.seq DESC LIMIT 1
  `);
  if (rows.rows.length === 0) return null;
  return {
    doc: rows.rows[0].snapshot as TripDoc,
    seq: Number(rows.rows[0].seq),
  };
}

/** The ops of every patch in (after, through], oldest first, for replay. */
export async function opsBetween(
  tripId: string,
  after: number,
  through: number,
  conn: Queryable = db,
): Promise<unknown[]> {
  const rows = await conn.execute(sql`
    SELECT ops FROM trip_patch
    WHERE trip_id = ${tripId} AND seq > ${after} AND seq <= ${through}
    ORDER BY seq ASC
  `);
  return rows.rows.map((r) => r.ops);
}

/**
 * Hands every trip from one user to another. Better Auth calls this when an
 * anonymous visitor signs up, before it deletes the anonymous user — and
 * `trip.user_id` is set null on delete, so it has to happen first or the
 * visitor loses the trip they just built.
 */
export async function reassignTrips(
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  await db
    .update(trip)
    .set({ userId: toUserId })
    .where(eq(trip.userId, fromUserId));
}
