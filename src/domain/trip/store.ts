import { type SQL, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { type Tx, withTransaction } from "../../db/tx.ts";
import { openingHours } from "../catalogue/opening-hours.ts";
import type { LonLat } from "../geo.ts";
import { diffDocs } from "./diff.ts";
import {
  type TripDoc,
  type TripNode,
  tripHeader,
  tripNode,
} from "./document.ts";
import { applyOps, type PatchOp, patchOps } from "./patch.ts";
import { straightLineTravel } from "./travel.ts";
import {
  type Author,
  type PlaceInfo,
  type Violation,
  validateProposal,
} from "./validate.ts";

// The patch log, and the node projection that hangs off it.
//
// `trip_node` rows are always the document at head: the match query (Phase 3)
// joins against them, so they can never drift from the log. Both are written in
// one transaction, under a row lock on the trip.

/** A snapshot every N patches keeps a restore from replaying the whole log. */
export const CHECKPOINT_EVERY = 20;

/**
 * Either connection: the HTTP client for reads, a transaction for the write
 * path. Only `execute` is used, so this stays structural.
 */
type Row = Record<string, unknown>;
type Queryable = { execute(query: SQL): Promise<{ rows: Row[] }> };

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
  conn: Queryable,
  tripId: string,
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

/** Catalogue facts the validator needs, for every place a document mentions. */
export async function loadPlaces(
  conn: Queryable,
  ids: readonly string[],
): Promise<Map<string, PlaceInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await conn.execute(sql`
    SELECT id, tier, opening_hours,
           ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat
    FROM place WHERE id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})
  `);
  return new Map(
    rows.rows.map((r) => {
      const hours = r.opening_hours
        ? openingHours.safeParse(r.opening_hours)
        : null;
      return [
        r.id as string,
        {
          tier: r.tier as PlaceInfo["tier"],
          openingHours: hours?.success ? hours.data : null,
          lonLat: [Number(r.lon), Number(r.lat)] as LonLat,
        },
      ];
    }),
  );
}

const placeIdsOf = (...docs: TripDoc[]) => [
  ...new Set(
    docs.flatMap((d) =>
      Object.values(d.nodes)
        .map((n) => n.placeId)
        .filter((id): id is string => id !== null),
    ),
  ),
];

async function writeNode(tx: Tx, tripId: string, id: string, node: TripNode) {
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

export type AppendInput = {
  tripId: string;
  /** The head the client saw. A mismatch is a 409, not a merge. */
  parentId: string | null;
  intent: string;
  ops: unknown;
  author: Author;
  /** Required for `intervention`: nothing the system proposes is auto-applied. */
  acceptedBy?: string | null;
  clientSeq?: number | null;
  meta?: Record<string, unknown>;
};

export type AppendFailure =
  | { ok: false; code: "not-found" }
  | { ok: false; code: "stale"; headPatchId: string | null }
  | { ok: false; code: "invalid"; issues: string[] }
  | { ok: false; code: "patch"; message: string }
  | {
      ok: false;
      code: "violations";
      blocking: Violation[];
      violations: Violation[];
    };

export type AppendSuccess = {
  ok: true;
  patchId: string;
  seq: number;
  doc: TripDoc;
  violations: Violation[];
  /** What this patch introduced — warnings, for a traveller's own edit. */
  introduced: Violation[];
};

/**
 * Appends one patch and re-projects the nodes it touched. The whole of every
 * day the patch affects is re-validated first: system and intervention patches
 * may not introduce an error, a traveller's own edit is applied with warnings
 * (context/phase-2-design.md §3).
 */
export async function appendPatch(
  input: AppendInput,
): Promise<AppendSuccess | AppendFailure> {
  if (input.author === "intervention" && !input.acceptedBy) {
    throw new Error("an intervention patch needs the user who accepted it");
  }

  return withTransaction(async (tx) => {
    const locked = await tx.execute(
      sql`SELECT id, head_patch_id FROM trip WHERE id = ${input.tripId} FOR UPDATE`,
    );
    if (locked.rows.length === 0) return { ok: false, code: "not-found" };

    const head = (locked.rows[0].head_patch_id as string | null) ?? null;
    if (head !== input.parentId) {
      return { ok: false, code: "stale", headPatchId: head };
    }

    const current = await loadTrip(tx, input.tripId);
    if (!current) return { ok: false, code: "not-found" };

    // Places the document mentions now, plus any the ops introduce.
    const proposed = patchOps.safeParse(input.ops);
    const added = proposed.success ? proposed.data.flatMap(placeIdsInOp) : [];
    const places = await loadPlaces(tx, [...placeIdsOf(current.doc), ...added]);

    const result = validateProposal(current.doc, input.ops, {
      places,
      travel: straightLineTravel,
      author: input.author,
    });
    if (!result.ok) {
      return result.kind === "invalid"
        ? { ok: false, code: "invalid", issues: result.issues }
        : result.kind === "patch"
          ? { ok: false, code: "patch", message: result.error.message }
          : {
              ok: false,
              code: "violations",
              blocking: result.blocking,
              violations: result.violations,
            };
    }

    const seq = current.seq + 1;
    const inserted = await tx.execute(sql`
      INSERT INTO trip_patch (trip_id, parent_id, intent, ops, inverse_ops, author,
                              accepted_by, seq, client_seq, meta)
      VALUES (${input.tripId}, ${input.parentId}, ${input.intent},
              ${JSON.stringify(input.ops)}::jsonb, ${JSON.stringify(result.inverse)}::jsonb,
              ${input.author}, ${input.acceptedBy ?? null}, ${seq},
              ${input.clientSeq ?? null}, ${JSON.stringify(input.meta ?? {})}::jsonb)
      RETURNING id
    `);
    const patchId = inserted.rows[0].id as string;

    for (const id of result.change.nodes) {
      const node = result.doc.nodes[id];
      if (node) await writeNode(tx, input.tripId, id, node);
      else
        await tx.execute(
          sql`DELETE FROM trip_node WHERE id = ${id} AND trip_id = ${input.tripId}`,
        );
    }

    await tx.execute(
      sql`UPDATE trip SET head_patch_id = ${patchId} WHERE id = ${input.tripId}`,
    );

    // Seq 1 is checkpointed too: the generated plan is the largest patch there
    // is, and no restore should have to replay it.
    if (seq === 1 || seq % CHECKPOINT_EVERY === 0) {
      await tx.execute(sql`
        INSERT INTO checkpoint_log (trip_id, patch_id, snapshot)
        VALUES (${input.tripId}, ${patchId}, ${JSON.stringify(result.doc)}::jsonb)
        ON CONFLICT (trip_id, patch_id) DO NOTHING
      `);
    }

    return {
      ok: true,
      patchId,
      seq,
      doc: result.doc,
      violations: result.violations,
      introduced: result.introduced,
    };
  });
}

/**
 * Places an op would bring in, so the validator has them to hand. Read from the
 * path, never from the value alone: every op value is a JSON value, and a
 * timestamp is as much a string as a place id is.
 */
function placeIdsInOp(op: PatchOp): string[] {
  if (op.op !== "add" && op.op !== "replace") return [];
  if (op.path.endsWith("/placeId")) {
    return typeof op.value === "string" ? [op.value] : [];
  }
  // A whole node: /nodes/{uuid}
  if (op.path.split("/").length !== 3) return [];
  const id = (op.value as { placeId?: unknown } | null)?.placeId;
  return typeof id === "string" ? [id] : [];
}

export type PatchRecord = {
  id: string;
  seq: number;
  intent: string;
  author: Author;
  appliedAt: string;
};

export async function patchHistory(
  conn: Queryable,
  tripId: string,
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

/**
 * The document as of a patch: the nearest checkpoint at or before it, with the
 * patches after it replayed. No validation on replay — each was validated when
 * it was written, and history is not rewritten.
 */
export async function docAt(
  conn: Queryable,
  tripId: string,
  patchId: string,
): Promise<TripDoc | null> {
  const target = await conn.execute(
    sql`SELECT seq FROM trip_patch WHERE id = ${patchId} AND trip_id = ${tripId}`,
  );
  if (target.rows.length === 0) return null;
  const seq = Number(target.rows[0].seq);

  const snapshot = await conn.execute(sql`
    SELECT c.snapshot, p.seq FROM checkpoint_log c
    JOIN trip_patch p ON p.id = c.patch_id
    WHERE c.trip_id = ${tripId} AND p.seq <= ${seq}
    ORDER BY p.seq DESC LIMIT 1
  `);
  if (snapshot.rows.length === 0) return null;

  let doc = snapshot.rows[0].snapshot as TripDoc;
  const from = Number(snapshot.rows[0].seq);
  const later = await conn.execute(sql`
    SELECT ops FROM trip_patch
    WHERE trip_id = ${tripId} AND seq > ${from} AND seq <= ${seq}
    ORDER BY seq ASC
  `);
  for (const row of later.rows) {
    doc = applyOps(doc, patchOps.parse(row.ops)).doc;
  }
  return doc;
}

/**
 * Undo is an append: the stored inverse of the head patch becomes the next one.
 * The log is never rewritten, so an undo is itself undoable.
 */
export async function undoLast(
  tripId: string,
  userId: string | null,
): Promise<
  AppendSuccess | AppendFailure | { ok: false; code: "nothing-to-undo" }
> {
  const rows = await db.execute(sql`
    SELECT p.id, p.intent, p.inverse_ops
    FROM trip t JOIN trip_patch p ON p.id = t.head_patch_id
    WHERE t.id = ${tripId}
  `);
  const head = rows.rows[0];
  if (!head) return { ok: false, code: "nothing-to-undo" };

  return appendPatch({
    tripId,
    parentId: head.id as string,
    intent: `Undo: ${head.intent as string}`,
    ops: head.inverse_ops,
    author: "user",
    acceptedBy: userId,
    meta: { undoOf: head.id },
  });
}

/** Restoring to an earlier patch appends the diff between then and now. */
export async function restoreTo(
  tripId: string,
  patchId: string,
  userId: string | null,
): Promise<
  | AppendSuccess
  | AppendFailure
  | { ok: false; code: "no-such-patch" }
  // The document already matches that patch (restoring right after an undo).
  | { ok: false; code: "no-change"; headPatchId: string | null }
> {
  const current = await loadTrip(db, tripId);
  if (!current) return { ok: false, code: "not-found" };
  const past = await docAt(db, tripId, patchId);
  if (!past) return { ok: false, code: "no-such-patch" };

  const ops: PatchOp[] = diffDocs(current.doc, past);
  if (ops.length === 0) {
    return { ok: false, code: "no-change", headPatchId: current.headPatchId };
  }
  return appendPatch({
    tripId,
    parentId: current.headPatchId,
    intent: "Restore an earlier version",
    ops,
    author: "user",
    acceptedBy: userId,
    meta: { restoreOf: patchId },
  });
}

/** An empty trip. Its first patch — generated or hand-built — follows. */
export async function createTrip(
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

/** The whole document as one patch: how a generated plan enters the log. */
export function addAllOps(doc: TripDoc): PatchOp[] {
  return Object.entries(doc.nodes).map(([id, node]) => ({
    op: "add" as const,
    path: `/nodes/${id}`,
    value: node,
  }));
}
