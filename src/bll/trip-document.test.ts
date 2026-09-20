import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { at, DAY, nodeId } from "../domain/trip/test-fixtures.ts";
import { appendPatch } from "./trip-document.ts";

// "Never auto-apply" is the product's first hard invariant
// (context/architecture.md): a patch the system proposes is only ever written
// once a traveller has accepted it. It is enforced twice — a CHECK constraint on
// `trip_patch` and the guard below — and this covers the guard.
//
// The guard runs before the transaction is opened, so this needs no database:
// reaching the store at all would fail with a different error.

const anyNode = {
  kind: "visit" as const,
  placeId: null,
  lonLat: [44.79, 41.72] as [number, number],
  startsAt: at(DAY, "10:00"),
  durationMin: 60,
  indoor: false,
  meta: { title: "Somewhere", urban: true },
};

const proposal = (acceptedBy?: string | null) => ({
  tripId: nodeId(1),
  parentId: null,
  intent: "Rain moved the hike",
  ops: [{ op: "add" as const, path: `/nodes/${nodeId(2)}`, value: anyNode }],
  author: "intervention" as const,
  ...(acceptedBy === undefined ? {} : { acceptedBy }),
});

describe("never auto-apply", () => {
  test("an intervention patch with no accepter is refused", async () => {
    await assert.rejects(
      appendPatch(proposal()),
      /needs the user who accepted it/,
    );
  });

  test("an explicit null accepter is refused too", async () => {
    await assert.rejects(
      appendPatch(proposal(null)),
      /needs the user who accepted it/,
    );
  });
});
