import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { diffDays, diffDocs } from "./diff.ts";
import {
  applyOps,
  PatchError,
  type PatchOp,
  patchOps,
  placeIdsInOps,
} from "./patch.ts";
import { at, DAY, kazbegiDoc, N, nodeId, P } from "./test-fixtures.ts";

const parse = (ops: unknown) => patchOps.parse(ops);

describe("op grammar", () => {
  const rejects = (ops: unknown) =>
    assert.equal(patchOps.safeParse(ops).success, false, JSON.stringify(ops));

  test("only allowlisted paths", () => {
    rejects([{ op: "replace", path: `/nodes/${N.hike}/geom`, value: "x" }]);
    rejects([{ op: "replace", path: `/nodes/${N.hike}/tripId`, value: "x" }]);
    rejects([{ op: "replace", path: "/trip/userId", value: "x" }]);
    rejects([{ op: "replace", path: "/trip/headPatchId", value: "x" }]);
    rejects([{ op: "replace", path: "/nodes/3/startsAt", value: "x" }]);
    rejects([{ op: "add", path: `/nodes/${N.hike}/startsAt`, value: {} }]);
    rejects([{ op: "remove", path: "/trip/title" }]);
    rejects([{ op: "move", from: "/nodes/a", path: "/nodes/b" }]);
    rejects([]);
  });

  test("an added node must be a whole, valid node", () => {
    rejects([
      { op: "add", path: `/nodes/${nodeId(99)}`, value: { kind: "visit" } },
    ]);
  });
});

describe("applyOps", () => {
  test("never mutates its input", () => {
    const doc = kazbegiDoc();
    const snapshot = structuredClone(doc);
    applyOps(doc, parse([{ op: "remove", path: `/nodes/${N.hike}` }]));
    assert.deepEqual(doc, snapshot);
  });

  test("add refuses an existing id; remove and replace refuse a missing one", () => {
    const doc = kazbegiDoc();
    const code = (ops: PatchOp[]) => {
      try {
        applyOps(doc, ops);
      } catch (e) {
        return (e as PatchError).code;
      }
    };
    assert.equal(
      code(
        parse([
          { op: "add", path: `/nodes/${N.hike}`, value: doc.nodes[N.hike] },
        ]),
      ),
      "exists",
    );
    assert.equal(
      code(parse([{ op: "remove", path: `/nodes/${nodeId(99)}` }])),
      "missing",
    );
    assert.equal(
      code(
        parse([
          { op: "replace", path: `/nodes/${nodeId(99)}/durationMin`, value: 5 },
        ]),
      ),
      "missing",
    );
  });

  test("a touched node is re-parsed: no place and no point together", () => {
    assert.throws(
      () =>
        applyOps(
          kazbegiDoc(),
          parse([
            { op: "replace", path: `/nodes/${N.hike}/placeId`, value: null },
          ]),
        ),
      (e) => e instanceof PatchError && e.code === "invalid",
    );
  });

  test("a trip that ends before it starts is invalid", () => {
    assert.throws(
      () =>
        applyOps(
          kazbegiDoc(),
          parse([
            {
              op: "replace",
              path: "/trip/endsAt",
              value: at("2026-09-01", "00:00"),
            },
          ]),
        ),
      (e) => e instanceof PatchError && e.code === "invalid",
    );
  });

  test("reports what it touched", () => {
    const { change } = applyOps(
      kazbegiDoc(),
      parse([
        { op: "replace", path: `/nodes/${N.hike}/durationMin`, value: 120 },
        { op: "remove", path: `/nodes/${N.dinner}` },
        { op: "replace", path: "/trip/pace", value: "relaxed" },
      ]),
    );
    assert.deepEqual([...change.nodes].sort(), [N.dinner, N.hike].sort());
    assert.equal(change.trip, true);
  });

  test("the inverse undoes any sequence of ops", () => {
    const doc = kazbegiDoc();
    const ops = parse([
      {
        op: "replace",
        path: `/nodes/${N.hike}/startsAt`,
        value: at(DAY, "15:00"),
      },
      {
        op: "replace",
        path: `/nodes/${N.hike}/startsAt`,
        value: at(DAY, "15:30"),
      },
      { op: "remove", path: `/nodes/${N.dinner}` },
      {
        op: "add",
        path: `/nodes/${N.dinner}`,
        value: { ...doc.nodes[N.dinner], durationMin: 60 },
      },
      {
        op: "replace",
        path: `/nodes/${N.lunch}/placeId`,
        value: P.verifiedCafe,
      },
      { op: "replace", path: "/trip/title", value: "Renamed" },
      {
        op: "add",
        path: `/nodes/${nodeId(99)}`,
        value: doc.nodes[N.breakfast],
      },
    ]);
    const applied = applyOps(doc, ops);
    assert.deepEqual(applyOps(applied.doc, applied.inverse).doc, doc);
  });
});

describe("diffDocs", () => {
  test("applying the diff reaches the target", () => {
    const from = kazbegiDoc();
    const to = applyOps(
      from,
      parse([
        {
          op: "replace",
          path: `/nodes/${N.hike}/startsAt`,
          value: at(DAY, "15:00"),
        },
        { op: "remove", path: `/nodes/${N.dinner}` },
        {
          op: "add",
          path: `/nodes/${nodeId(99)}`,
          value: from.nodes[N.breakfast],
        },
        { op: "replace", path: "/trip/pace", value: "packed" },
      ]),
    ).doc;
    assert.deepEqual(applyOps(from, parse(diffDocs(from, to))).doc, to);
  });

  test("identical documents diff to nothing", () => {
    assert.deepEqual(diffDocs(kazbegiDoc(), kazbegiDoc()), []);
  });
});

describe("diffDays", () => {
  test("a retimed node is moved; a node that changes day shows on both", () => {
    const before = kazbegiDoc();
    const after = applyOps(
      before,
      parse([
        {
          op: "replace",
          path: `/nodes/${N.hike}/startsAt`,
          value: at(DAY, "11:30"),
        },
        {
          op: "replace",
          path: `/nodes/${N.dinner}/startsAt`,
          value: at("2026-09-17", "19:30"),
        },
        {
          op: "replace",
          path: `/nodes/${N.lunch}/placeId`,
          value: P.verifiedCafe,
        },
      ]),
    ).doc;
    const days = diffDays(before, after);
    assert.deepEqual(
      days.map((d) => [d.day, d.changes.map((c) => `${c.kind}:${c.id}`)]),
      [
        // In time order: the hike now starts at 11:30, before lunch.
        [DAY, [`moved:${N.hike}`, `changed:${N.lunch}`, `removed:${N.dinner}`]],
        ["2026-09-17", [`moved:${N.dinner}`]],
      ],
    );
  });
});

describe("places an op introduces", () => {
  test("a whole added node, and a placeId swapped on an existing one", () => {
    const added = kazbegiDoc().nodes[N.lunch];
    assert.deepEqual(
      placeIdsInOps(
        parse([
          {
            op: "add",
            path: `/nodes/${nodeId(99)}`,
            value: { ...added, placeId: P.verifiedCafe },
          },
          {
            op: "replace",
            path: `/nodes/${N.hike}/placeId`,
            value: P.gergeti,
          },
        ]),
      ).sort(),
      [P.gergeti, P.verifiedCafe].sort(),
    );
  });

  test("a string that isn't at a placeId path is not a place", () => {
    assert.deepEqual(
      placeIdsInOps(
        parse([
          {
            op: "replace",
            path: `/nodes/${N.hike}/startsAt`,
            value: at(DAY, "09:00"),
          },
          { op: "remove", path: `/nodes/${N.dinner}` },
        ]),
      ),
      [],
    );
  });
});
