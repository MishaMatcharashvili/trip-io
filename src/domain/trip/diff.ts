import { dayKey, jsonEqual, type TripDoc, type TripNode } from "./document.ts";
import { nodeFields, type PatchOp, tripFields } from "./patch.ts";

// Two uses. `diffDocs` turns "the document at patch N" into ops against head,
// which is how restore stays append-only. `diffDays` is the coherent-day diff an
// intervention is shown as (Phase 5): accepted or rejected as one unit.

/** Ops that turn `from` into `to`. Field-level where a node survives. */
export function diffDocs(from: TripDoc, to: TripDoc): PatchOp[] {
  const ops: PatchOp[] = [];

  for (const field of tripFields) {
    if (!jsonEqual(from.trip[field], to.trip[field])) {
      ops.push({
        op: "replace",
        path: `/trip/${field}`,
        value: to.trip[field],
      });
    }
  }

  for (const [id, node] of Object.entries(from.nodes)) {
    const next = to.nodes[id];
    if (next === undefined) {
      ops.push({ op: "remove", path: `/nodes/${id}` });
      continue;
    }
    for (const field of nodeFields) {
      if (!jsonEqual(node[field], next[field])) {
        ops.push({
          op: "replace",
          path: `/nodes/${id}/${field}`,
          value: next[field],
        });
      }
    }
  }

  for (const [id, node] of Object.entries(to.nodes)) {
    if (from.nodes[id] === undefined) {
      ops.push({ op: "add", path: `/nodes/${id}`, value: node });
    }
  }

  return ops;
}

export type NodeChange =
  | { kind: "added"; id: string; after: TripNode }
  | { kind: "removed"; id: string; before: TripNode }
  | { kind: "moved"; id: string; before: TripNode; after: TripNode }
  | { kind: "changed"; id: string; before: TripNode; after: TripNode };

export type DayDiff = { day: string; changes: NodeChange[] };

/**
 * Node changes grouped by day. A node moved across days appears under both: as
 * `moved` on the day it now falls on, and as `removed` from the day it left.
 */
export function diffDays(before: TripDoc, after: TripDoc): DayDiff[] {
  const byDay = new Map<string, NodeChange[]>();
  const push = (day: string, change: NodeChange) =>
    byDay.set(day, [...(byDay.get(day) ?? []), change]);

  const ids = new Set([
    ...Object.keys(before.nodes),
    ...Object.keys(after.nodes),
  ]);
  for (const id of ids) {
    const a = before.nodes[id];
    const b = after.nodes[id];
    if (a && !b) push(dayKey(a.startsAt), { kind: "removed", id, before: a });
    else if (!a && b) push(dayKey(b.startsAt), { kind: "added", id, after: b });
    else if (a && b && !jsonEqual(a, b)) {
      const retimed =
        a.startsAt !== b.startsAt || a.durationMin !== b.durationMin;
      const { startsAt: _s, durationMin: _d, ...aRest } = a;
      const { startsAt: _s2, durationMin: _d2, ...bRest } = b;
      const kind = retimed && jsonEqual(aRest, bRest) ? "moved" : "changed";
      push(dayKey(b.startsAt), { kind, id, before: a, after: b });
      if (dayKey(a.startsAt) !== dayKey(b.startsAt)) {
        push(dayKey(a.startsAt), { kind: "removed", id, before: a });
      }
    }
  }

  return [...byDay.entries()]
    .sort(([x], [y]) => (x < y ? -1 : 1))
    .map(([day, changes]) => ({
      day,
      changes: changes.sort(
        (x, y) =>
          Date.parse(("after" in x ? x.after : x.before).startsAt) -
          Date.parse(("after" in y ? y.after : y.before).startsAt),
      ),
    }));
}
