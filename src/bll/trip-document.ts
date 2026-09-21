import { placeFacts } from "../dal/places.ts";
import {
  checkpointAtOrBefore,
  deleteNode,
  insertCheckpoint,
  insertPatch,
  insertTrip,
  loadHeadPatch,
  loadTrip,
  loadTripRef,
  lockTrip,
  opsBetween,
  type PatchRecord,
  patchHistory,
  patchSeq,
  setHead,
  type TripRef,
  upsertNode,
} from "../dal/trips.ts";
import { withTransaction } from "../dal/tx.ts";
import { refreshWatch } from "../dal/watches.ts";
import { diffDocs } from "../domain/trip/diff.ts";
import { placeIdsOf, type TripDoc } from "../domain/trip/document.ts";
import {
  applyOps,
  type PatchOp,
  patchOps,
  placeIdsInOps,
} from "../domain/trip/patch.ts";
import { straightLineTravel } from "../domain/trip/travel.ts";
import {
  type Author,
  type ProposalResult,
  type Violation,
  validateDoc,
  validateProposal,
} from "../domain/trip/validate.ts";
import { watchDefaults } from "../domain/watch/settings.ts";

// Writing to a trip. Every change is a patch: validated against the whole of
// every day it touches, appended to the log, and projected onto `trip_node` in
// the same transaction.
//
// The rules are the domain's (src/domain/trip/validate.ts) and the rows are the
// data layer's (src/dal/trips.ts); what lives here is the order they happen in.

/** A snapshot every N patches keeps a restore from replaying the whole log. */
export const CHECKPOINT_EVERY = 20;

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
    const locked = await lockTrip(tx, input.tripId);
    if (!locked) return { ok: false, code: "not-found" };
    if (locked.headPatchId !== input.parentId) {
      return { ok: false, code: "stale", headPatchId: locked.headPatchId };
    }

    const current = await loadTrip(input.tripId, tx);
    if (!current) return { ok: false, code: "not-found" };

    // Places the document mentions now, plus any the ops introduce.
    const proposed = patchOps.safeParse(input.ops);
    const added = proposed.success ? placeIdsInOps(proposed.data) : [];
    const places = await placeFacts([...placeIdsOf(current.doc), ...added], tx);

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
    const patchId = await insertPatch(tx, {
      tripId: input.tripId,
      parentId: input.parentId,
      intent: input.intent,
      ops: input.ops,
      inverseOps: result.inverse,
      author: input.author,
      acceptedBy: input.acceptedBy ?? null,
      seq,
      clientSeq: input.clientSeq ?? null,
      meta: input.meta ?? {},
    });

    for (const id of result.change.nodes) {
      const node = result.doc.nodes[id];
      if (node) await upsertNode(tx, input.tripId, id, node);
      else await deleteNode(tx, input.tripId, id);
    }

    await setHead(tx, input.tripId, patchId);

    // The watch is written here rather than at trip creation because it is
    // derived from the node projection: an empty trip has no footprint to
    // watch, and a trip that has been replanned must not stay watched in a
    // region it no longer visits. Same transaction, same guarantee as the
    // projection itself.
    await refreshWatch(input.tripId, watchDefaults(result.doc.trip), tx);

    // Seq 1 is checkpointed too: the generated plan is the largest patch there
    // is, and no restore should have to replay it.
    if (seq === 1 || seq % CHECKPOINT_EVERY === 0) {
      await insertCheckpoint(tx, input.tripId, patchId, result.doc);
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
 * The document as of a patch: the nearest checkpoint at or before it, with the
 * patches after it replayed. No validation on replay — each was validated when
 * it was written, and history is not rewritten.
 */
export async function docAt(
  tripId: string,
  patchId: string,
): Promise<TripDoc | null> {
  const seq = await patchSeq(tripId, patchId);
  if (seq === null) return null;

  const checkpoint = await checkpointAtOrBefore(tripId, seq);
  if (!checkpoint) return null;

  let doc = checkpoint.doc;
  for (const ops of await opsBetween(tripId, checkpoint.seq, seq)) {
    doc = applyOps(doc, patchOps.parse(ops)).doc;
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
  const head = await loadHeadPatch(tripId);
  if (!head) return { ok: false, code: "nothing-to-undo" };

  return appendPatch({
    tripId,
    parentId: head.id,
    intent: `Undo: ${head.intent}`,
    ops: head.inverseOps,
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
  const current = await loadTrip(tripId);
  if (!current) return { ok: false, code: "not-found" };
  const past = await docAt(tripId, patchId);
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
export function createTrip(
  header: TripDoc["trip"],
  userId: string | null,
): Promise<string> {
  return insertTrip(header, userId);
}

/** The whole document as one patch: how a generated plan enters the log. */
export function addAllOps(doc: TripDoc): PatchOp[] {
  return Object.entries(doc.nodes).map(([id, node]) => ({
    op: "add" as const,
    path: `/nodes/${id}`,
    value: node,
  }));
}

export type TripView = {
  doc: TripDoc;
  head: string | null;
  seq: number;
  /** Everything wrong with the document as it stands, for the whole trip. */
  violations: Violation[];
};

/** The trip screen's read: the document at head, checked. */
export async function tripView(tripId: string): Promise<TripView | null> {
  const trip = await loadTrip(tripId);
  if (!trip) return null;

  const places = await placeFacts(placeIdsOf(trip.doc));
  return {
    doc: trip.doc,
    head: trip.headPatchId,
    seq: trip.seq,
    violations: validateDoc(trip.doc, {
      places,
      travel: straightLineTravel,
      author: "user",
    }),
  };
}

/**
 * Would these ops leave the trip coherent? A dry run of what `appendPatch`
 * checks, changing nothing: the replan preview now, the intervention diff in
 * Phase 5.
 */
export async function previewPatch(
  tripId: string,
  ops: readonly PatchOp[],
): Promise<ProposalResult | null> {
  const trip = await loadTrip(tripId);
  if (!trip) return null;

  const places = await placeFacts([
    ...placeIdsOf(trip.doc),
    ...placeIdsInOps(ops),
  ]);
  return validateProposal(trip.doc, ops, {
    places,
    travel: straightLineTravel,
    author: "user",
  });
}

/** The patch log, newest first. */
export function history(tripId: string): Promise<PatchRecord[]> {
  return patchHistory(tripId);
}

export type TripAccess =
  | { ok: true; trip: TripRef }
  | { ok: false; reason: "not-found" | "forbidden" };

/**
 * May this user act on this trip? The check every trip handler starts with. It
 * reads one row — owner and head — rather than projecting the whole document:
 * most callers only need to know whether to go on, and the ones that need the
 * document ask for it afterwards.
 */
export async function accessTrip(
  tripId: string,
  userId: string,
): Promise<TripAccess> {
  const trip = await loadTripRef(tripId);
  if (!trip) return { ok: false, reason: "not-found" };
  if (trip.userId !== userId) return { ok: false, reason: "forbidden" };
  return { ok: true, trip };
}
