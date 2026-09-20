import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Proposal, placeIdsInProposals, toOps } from "./proposal.ts";

const HIKE = "11111111-1111-4111-8111-111111111111";
const MUSEUM = "22222222-2222-4222-8222-222222222222";
const LUNCH = "33333333-3333-4333-8333-333333333333";
const PLACE = "44444444-4444-4444-8444-444444444444";

const nodes = new Map([
  [HIKE, { startsAt: "2026-10-04T05:00:00.000Z" }],
  [LUNCH, { startsAt: "2026-10-04T09:00:00.000Z" }],
]);

describe("translating a proposal into a patch", () => {
  test("a shift moves the stop by the offset, in absolute time", () => {
    // The model says "two hours earlier"; the domain works out what that is.
    assert.deepEqual(
      toOps([{ move: "shift", nodeId: HIKE, byMinutes: -120 }], nodes).ops,
      [
        {
          op: "replace",
          path: `/nodes/${HIKE}/startsAt`,
          value: "2026-10-04T03:00:00.000Z",
        },
      ],
    );
  });

  test("a swap carries the new place's indoor flag with it", () => {
    // Left behind, the old flag would have an indoor museum judged against dusk.
    assert.deepEqual(
      toOps(
        [{ move: "swap", nodeId: HIKE, placeId: PLACE, indoor: true }],
        nodes,
      ).ops,
      [
        { op: "replace", path: `/nodes/${HIKE}/placeId`, value: PLACE },
        { op: "replace", path: `/nodes/${HIKE}/indoor`, value: true },
      ],
    );
  });

  test("shorten and drop say the obvious thing", () => {
    assert.deepEqual(
      toOps(
        [
          { move: "shorten", nodeId: HIKE, toMinutes: 90 },
          { move: "drop", nodeId: LUNCH },
        ],
        nodes,
      ).ops,
      [
        { op: "replace", path: `/nodes/${HIKE}/durationMin`, value: 90 },
        { op: "remove", path: `/nodes/${LUNCH}` },
      ],
    );
  });

  test("a cascade translates as one patch set", () => {
    // Moving the hike displaces lunch: one intervention, one diff, one accept.
    const { ops, errors } = toOps(
      [
        { move: "shift", nodeId: HIKE, byMinutes: -120 },
        { move: "shift", nodeId: LUNCH, byMinutes: -60 },
      ],
      nodes,
    );
    assert.deepEqual(errors, []);
    assert.equal(ops.length, 2);
  });

  test("a node the trip does not have is reported, not skipped", () => {
    // Half a cascade is worse than none: the traveller would accept a diff
    // that moves the hike and leaves lunch on top of it.
    const { ops, errors } = toOps(
      [
        { move: "shift", nodeId: HIKE, byMinutes: -120 },
        { move: "drop", nodeId: MUSEUM },
      ],
      nodes,
    );
    assert.deepEqual(errors, [
      { nodeId: MUSEUM, message: "no such node on this trip" },
    ]);
    assert.equal(ops.length, 1);
  });

  test("nothing proposed is nothing patched", () => {
    assert.deepEqual(toOps([], nodes), { ops: [], errors: [] });
  });
});

describe("places a proposal would introduce", () => {
  test("are the swaps, without repeats", () => {
    const proposals: Proposal[] = [
      { move: "swap", nodeId: HIKE, placeId: PLACE, indoor: true },
      { move: "swap", nodeId: LUNCH, placeId: PLACE, indoor: true },
      { move: "drop", nodeId: MUSEUM },
    ];
    assert.deepEqual(placeIdsInProposals(proposals), [PLACE]);
  });

  test("a proposal that moves nothing introduces no place", () => {
    assert.deepEqual(
      placeIdsInProposals([{ move: "shift", nodeId: HIKE, byMinutes: 60 }]),
      [],
    );
  });
});
