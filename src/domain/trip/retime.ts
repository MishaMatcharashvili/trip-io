import {
  dayKey,
  locate,
  nodeEnd,
  sortedNodes,
  type TripDoc,
  type TripNode,
} from "./document.ts";
import type { PatchOp } from "./patch.ts";
import type { TravelEstimator } from "./travel.ts";
import {
  IMPLICIT_LEG_MAX_MIN,
  LEG_BUFFER_MIN,
  type PlaceInfo,
} from "./validate.ts";

// Changing one stop's time or length, and what that does to the rest of the day.
//
// A traveller's edit is applied as asked, and what it breaks is only a warning
// (validate.ts: for a user, only a place outside what they may use blocks). So
// lengthening lunch by an hour used to leave the check-in an hour inside it and
// say nothing. This turns an edit into the ops that make it coherent: the edit
// itself, and each later stop pushed — never pulled — just far enough to clear
// the one before it and the way between them.
//
// Pure: a document and an edit in, ops out. The caller shows the pushes before
// they are made and applies them as one patch, so a change that moves three
// stops is one change and one undo.

const MIN = 60_000;
const roundUp5 = (ms: number) => Math.ceil(ms / (5 * MIN)) * 5 * MIN;

export type NodeEdit = { startsAt?: string; durationMin?: number };

export type Pushed = {
  id: string;
  title: string;
  from: string;
  to: string;
};

export type Retimed = {
  /** The edit first, then one `startsAt` replacement per stop pushed. */
  ops: PatchOp[];
  /** The stops moved besides the one edited, in the order of the day. */
  pushed: Pushed[];
  /**
   * The push would run past the end of the day or the trip. Then nothing is
   * pushed: stops are never moved into tomorrow, and the edit alone is offered.
   */
  overflow: boolean;
};

export type RetimeContext = {
  places: ReadonlyMap<string, PlaceInfo>;
  travel: TravelEstimator;
};

/**
 * What it takes to get from one stop to the next: the walk or short drive and
 * the buffer the validator asks for. A leg too long to be implicit needs a
 * transfer stop, which no amount of shifting makes; it asks for nothing here.
 */
function gapMinutes(
  travel: TravelEstimator,
  from: Parameters<TravelEstimator["minutes"]>[0],
  to: Parameters<TravelEstimator["minutes"]>[1],
): number {
  const need = travel.minutes(from, to);
  return need === 0 || need > IMPLICIT_LEG_MAX_MIN ? 0 : need + LEG_BUFFER_MIN;
}

export function retime(
  doc: TripDoc,
  id: string,
  edit: NodeEdit,
  ctx: RetimeContext,
): Retimed {
  const original = doc.nodes[id];
  if (!original) throw new Error(`no such stop: ${id}`);

  const edited: TripNode = {
    ...original,
    ...(edit.startsAt === undefined ? {} : { startsAt: edit.startsAt }),
    ...(edit.durationMin === undefined
      ? {}
      : { durationMin: edit.durationMin }),
  };
  const ops: PatchOp[] = [];
  if (edit.startsAt !== undefined) {
    ops.push({
      op: "replace",
      path: `/nodes/${id}/startsAt`,
      value: edit.startsAt,
    });
  }
  if (edit.durationMin !== undefined) {
    ops.push({
      op: "replace",
      path: `/nodes/${id}/durationMin`,
      value: edit.durationMin,
    });
  }

  // The day in its new order: what comes after the edited stop is whatever now
  // starts after it, which is not always what did before.
  const day = dayKey(edited.startsAt);
  const sorted = sortedNodes({ ...doc.nodes, [id]: edited }).filter(
    (e) => dayKey(e.node.startsAt) === day,
  );
  const after = sorted.slice(sorted.findIndex((e) => e.id === id) + 1);

  const tripEnd = Date.parse(doc.trip.endsAt);
  const pushed: Pushed[] = [];
  const pushOps: PatchOp[] = [];
  let prevEnd = nodeEnd(edited);
  let prevAt = locate(edited, ctx.places);

  for (const { id: nodeId, node } of after) {
    const here = locate(node, ctx.places);
    // A transfer starts where you are and is the travel itself.
    const gap =
      node.kind === "transfer" || !prevAt || !here
        ? 0
        : gapMinutes(ctx.travel, prevAt, here);
    const earliest = prevEnd + gap * MIN;
    // Room already: it, and so everything after it, was right and stays right.
    if (Date.parse(node.startsAt) >= earliest) break;

    const start = roundUp5(earliest);
    const moved: TripNode = {
      ...node,
      startsAt: new Date(start).toISOString(),
    };
    const end = nodeEnd(moved);
    // Not into tomorrow, and not past the trip.
    if (dayKey(start) !== day || dayKey(end - 1) !== day || end > tripEnd) {
      return { ops, pushed: [], overflow: true };
    }

    pushed.push({
      id: nodeId,
      title: node.meta.title,
      from: node.startsAt,
      to: moved.startsAt,
    });
    pushOps.push({
      op: "replace",
      path: `/nodes/${nodeId}/startsAt`,
      value: moved.startsAt,
    });
    prevEnd = end;
    prevAt = here;
  }

  return { ops: [...ops, ...pushOps], pushed, overflow: false };
}
