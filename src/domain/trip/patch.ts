import { z } from "zod";
import {
  jsonEqual,
  type TripDoc,
  type TripHeader,
  type TripNode,
  tripHeader,
  tripNode,
} from "./document.ts";

// JSON Patch (RFC 6902) restricted to a path grammar. The grammar is the
// security boundary for everything that writes a trip — the traveller's client,
// the generator and the judge's proposals all go through it — so it is an
// allowlist, not a general-purpose applier:
//
//   add | remove | replace   /nodes/{uuid}
//   replace                  /nodes/{uuid}/{nodeField}
//   replace                  /trip/{tripField}
//   test                     any of the above
//
// `add` never overwrites (RFC 6902 would); a node id is minted once.

const uuidPattern =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const nodeFields = [
  "kind",
  "placeId",
  "lonLat",
  "startsAt",
  "durationMin",
  "indoor",
  "meta",
] as const;
export const tripFields = [
  "title",
  "startsAt",
  "endsAt",
  "party",
  "pace",
  "budget",
  "prefs",
] as const;

const nodePath = z
  .string()
  .regex(new RegExp(`^/nodes/${uuidPattern}$`), "expected /nodes/{uuid}");
const fieldPath = z
  .string()
  .regex(
    new RegExp(
      `^(/nodes/${uuidPattern}/(${nodeFields.join("|")})|/trip/(${tripFields.join("|")}))$`,
    ),
    "path is not patchable",
  );
const anyPath = z.union([nodePath, fieldPath]);

export const patchOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add"), path: nodePath, value: tripNode }),
  z.object({ op: z.literal("remove"), path: nodePath }),
  z.object({ op: z.literal("replace"), path: anyPath, value: z.unknown() }),
  z.object({ op: z.literal("test"), path: anyPath, value: z.unknown() }),
]);
export type PatchOp = z.infer<typeof patchOp>;

export const patchOps = z.array(patchOp).min(1).max(500);

export type PatchErrorCode = "exists" | "missing" | "test-failed" | "invalid";

export class PatchError extends Error {
  readonly code: PatchErrorCode;
  readonly path: string;

  constructor(code: PatchErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "PatchError";
    this.code = code;
    this.path = path;
  }
}

export type Change = {
  /** Every node id an op added, removed or edited. */
  nodes: Set<string>;
  /** Whether a trip-level field changed (dates or pace affect every day). */
  trip: boolean;
};

export type Applied = {
  doc: TripDoc;
  /** Ops that take `doc` back to the input; stored on the patch for undo. */
  inverse: PatchOp[];
  change: Change;
};

type Target =
  | { kind: "node"; id: string }
  | { kind: "nodeField"; id: string; field: (typeof nodeFields)[number] }
  | { kind: "tripField"; field: (typeof tripFields)[number] };

function target(path: string): Target {
  const [, root, a, b] = path.split("/");
  if (root === "trip") {
    return { kind: "tripField", field: a as (typeof tripFields)[number] };
  }
  return b === undefined
    ? { kind: "node", id: a }
    : { kind: "nodeField", id: a, field: b as (typeof nodeFields)[number] };
}

function read(doc: TripDoc, t: Target): unknown {
  switch (t.kind) {
    case "node":
      return doc.nodes[t.id];
    case "nodeField":
      return doc.nodes[t.id]?.[t.field];
    case "tripField":
      return doc.trip[t.field];
  }
}

/**
 * Applies already-parsed ops (see `patchOps`) to a copy of the document. Pure:
 * the input is never mutated. Every node and trip header an op touched is
 * re-parsed afterwards, so a patch can't leave a node in a shape the schema
 * forbids (e.g. both a placeId and a lonLat).
 */
export function applyOps(doc: TripDoc, ops: readonly PatchOp[]): Applied {
  const next: TripDoc = structuredClone(doc);
  const inverse: PatchOp[] = [];
  const change: Change = { nodes: new Set(), trip: false };

  for (const op of ops) {
    const t = target(op.path);
    const current = read(next, t);

    if (op.op === "test") {
      if (!jsonEqual(current, op.value)) {
        throw new PatchError("test-failed", op.path, "value has changed");
      }
      continue;
    }

    if (op.op === "add") {
      if (t.kind !== "node") {
        throw new PatchError("invalid", op.path, "add targets a node");
      }
      if (current !== undefined) {
        throw new PatchError("exists", op.path, "node already exists");
      }
      next.nodes[t.id] = structuredClone(op.value);
      inverse.push({ op: "remove", path: op.path });
      change.nodes.add(t.id);
      continue;
    }

    if (t.kind !== "tripField" && next.nodes[t.id] === undefined) {
      throw new PatchError("missing", op.path, "no such node");
    }

    if (op.op === "remove") {
      if (t.kind !== "node") {
        throw new PatchError("invalid", op.path, "remove targets a node");
      }
      inverse.push({
        op: "add",
        path: op.path,
        value: current as TripNode,
      });
      delete next.nodes[t.id];
      change.nodes.add(t.id);
      continue;
    }

    // replace
    const value = structuredClone(op.value);
    inverse.push({ op: "replace", path: op.path, value: current });
    switch (t.kind) {
      case "node":
        next.nodes[t.id] = value as TripNode;
        change.nodes.add(t.id);
        break;
      case "nodeField":
        (next.nodes[t.id] as Record<string, unknown>)[t.field] = value;
        change.nodes.add(t.id);
        break;
      case "tripField":
        (next.trip as Record<string, unknown>)[t.field] = value;
        change.trip = true;
        break;
    }
  }

  for (const id of change.nodes) {
    const node = next.nodes[id];
    if (node === undefined) continue;
    const parsed = tripNode.safeParse(node);
    if (!parsed.success) {
      throw new PatchError(
        "invalid",
        `/nodes/${id}`,
        parsed.error.issues[0].message,
      );
    }
    next.nodes[id] = parsed.data;
  }
  if (change.trip) {
    const parsed = tripHeader.safeParse(next.trip);
    if (!parsed.success) {
      throw new PatchError("invalid", "/trip", parsed.error.issues[0].message);
    }
    next.trip = parsed.data as TripHeader;
  }

  return { doc: next, inverse: inverse.reverse(), change };
}
