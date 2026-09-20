import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TripDoc } from "./document.ts";
import type { PatchOp } from "./patch.ts";
import { at, DAY, kazbegiDoc, N, P, PREV, places } from "./test-fixtures.ts";
import { straightLineTravel } from "./travel.ts";
import {
  type Author,
  affectedDays,
  newViolations,
  type Violation,
  validateDay,
  validateProposal,
} from "./validate.ts";

const ctx = (author: Author = "system") => ({
  places,
  travel: straightLineTravel,
  author,
});

const edit = (
  doc: TripDoc,
  id: string,
  fields: Partial<TripDoc["nodes"][string]>,
) => {
  doc.nodes[id] = { ...doc.nodes[id], ...fields };
  return doc;
};

const rules = (vs: Violation[]) =>
  vs.map((v) => `${v.severity}:${v.rule}`).sort();

const only = (vs: Violation[], rule: Violation["rule"]) =>
  vs.filter((v) => v.rule === rule);

describe("validateDay: the coherent Kazbegi day", () => {
  for (const author of ["system", "intervention", "user"] as const) {
    test(`has no violations for ${author}`, () => {
      assert.deepEqual(validateDay(kazbegiDoc(), DAY, ctx(author)), []);
    });
  }
});

describe("overlap", () => {
  test("lunch moved into the drive", () => {
    const doc = edit(kazbegiDoc(), N.lunch, { startsAt: at(DAY, "11:30") });
    const [v] = only(validateDay(doc, DAY, ctx()), "overlap");
    assert.equal(v.severity, "error");
    assert.deepEqual(v.nodeIds.sort(), [N.drive, N.lunch].sort());
    assert.match(v.message, /Lunch · Zeta Camp/);
  });

  test("a long node overlapping two later ones flags both", () => {
    const doc = edit(kazbegiDoc(), N.lunch, { durationMin: 300 });
    const overlaps = only(validateDay(doc, DAY, ctx()), "overlap");
    assert.deepEqual(
      overlaps.map((v) => v.nodeIds.find((id) => id !== N.lunch)).sort(),
      [N.hike, N.stayKazbegi].sort(),
    );
  });
});

describe("travel", () => {
  test("no time to get from the viewpoint to the drive's start is fine: a transfer starts where you are", () => {
    const doc = edit(kazbegiDoc(), N.drive, { startsAt: at(DAY, "10:55") });
    assert.deepEqual(only(validateDay(doc, DAY, ctx()), "travel"), []);
  });

  test("a transfer shorter than the drive it claims", () => {
    const doc = edit(kazbegiDoc(), N.drive, { durationMin: 20 });
    const [v] = only(validateDay(doc, DAY, ctx()), "travel");
    assert.deepEqual(v.nodeIds, [N.drive]);
    assert.match(v.message, /Drive to Kazbegi/);
  });

  test("a long leg with no transfer", () => {
    const doc = kazbegiDoc();
    delete doc.nodes[N.drive];
    const [v] = only(validateDay(doc, DAY, ctx()), "travel");
    assert.deepEqual(v.nodeIds.sort(), [N.friendship, N.lunch].sort());
    assert.match(v.message, /transfer/);
  });

  test("a short leg with too small a gap", () => {
    // Hike ends 18:40; Gergeti to the café is a few minutes plus the buffer.
    const doc = edit(kazbegiDoc(), N.dinner, { startsAt: at(DAY, "18:42") });
    const [v] = only(validateDay(doc, DAY, ctx()), "travel");
    assert.deepEqual(v.nodeIds.sort(), [N.dinner, N.hike].sort());
  });

  test("the first stop must be reachable from last night's base", () => {
    const doc = edit(kazbegiDoc(), N.stayGudauri, {
      placeId: P.tbilisiHotel,
      meta: { title: "Check in · Tbilisi", urban: true },
    });
    const [v] = only(validateDay(doc, DAY, ctx()), "travel");
    assert.deepEqual(v.nodeIds.sort(), [N.breakfast, N.stayGudauri].sort());
  });

  test("the last stop must get back to tonight's base", () => {
    const doc = edit(kazbegiDoc(), N.stayKazbegi, { placeId: P.roomsGudauri });
    const travel = only(validateDay(doc, DAY, ctx()), "travel");
    assert.ok(
      travel.some(
        (v) =>
          v.nodeIds.includes(N.dinner) && v.nodeIds.includes(N.stayKazbegi),
      ),
    );
  });
});

describe("darkness", () => {
  test("the hike pushed past civil dusk (19:39 in Kazbegi that day)", () => {
    const doc = edit(kazbegiDoc(), N.hike, { startsAt: at(DAY, "17:30") });
    const [v] = only(validateDay(doc, DAY, ctx()), "darkness");
    assert.deepEqual(v.nodeIds, [N.hike]);
    assert.match(v.message, /19:39/);
  });

  test("a mountain drive after dusk", () => {
    const doc = kazbegiDoc();
    edit(doc, N.drive, { startsAt: at(DAY, "19:30") });
    assert.deepEqual(
      only(validateDay(doc, DAY, ctx()), "darkness").map((v) => v.nodeIds),
      [[N.drive]],
    );
  });

  test("an urban drive after dusk is fine", () => {
    const doc = kazbegiDoc();
    edit(doc, N.drive, {
      startsAt: at(DAY, "19:30"),
      meta: { ...doc.nodes[N.drive].meta, urban: true },
    });
    assert.deepEqual(only(validateDay(doc, DAY, ctx()), "darkness"), []);
  });

  test("dinner after dark is fine", () => {
    assert.deepEqual(
      only(validateDay(kazbegiDoc(), DAY, ctx()), "darkness"),
      [],
    );
  });

  test("an outdoor visit before dawn", () => {
    const doc = edit(kazbegiDoc(), N.friendship, {
      startsAt: at(DAY, "05:30"),
    });
    assert.equal(only(validateDay(doc, DAY, ctx()), "darkness").length, 1);
  });
});

describe("closed", () => {
  test("dinner running past closing", () => {
    const doc = edit(kazbegiDoc(), N.dinner, { startsAt: at(DAY, "22:00") });
    const [v] = only(validateDay(doc, DAY, ctx()), "closed");
    assert.deepEqual(v.nodeIds, [N.dinner]);
  });

  test("a museum on its closed day", () => {
    const doc = edit(kazbegiDoc(), N.hike, {
      placeId: P.museum,
      indoor: true,
      durationMin: 90,
    });
    assert.equal(only(validateDay(doc, DAY, ctx()), "closed").length, 1);
  });
});

describe("tier, by author", () => {
  const withPlace = (placeId: string) =>
    edit(kazbegiDoc(), N.dinner, { placeId });

  test("system may only use curated places", () => {
    assert.deepEqual(
      rules(validateDay(withPlace(P.verifiedCafe), DAY, ctx("system"))),
      ["error:tier"],
    );
  });

  test("intervention may use verified, not raw", () => {
    assert.deepEqual(
      validateDay(withPlace(P.verifiedCafe), DAY, ctx("intervention")),
      [],
    );
    assert.ok(
      rules(
        validateDay(withPlace(P.rawBar), DAY, ctx("intervention")),
      ).includes("error:tier"),
    );
  });

  test("user may use any tier", () => {
    assert.deepEqual(
      only(validateDay(withPlace(P.rawBar), DAY, ctx("user")), "tier"),
      [],
    );
  });

  test("an unknown place is an error for everyone", () => {
    for (const author of ["system", "intervention", "user"] as const) {
      const doc = withPlace("10000000-0000-4000-8000-0000000000ff");
      assert.ok(
        rules(validateDay(doc, DAY, ctx(author))).includes("error:tier"),
      );
    }
  });

  test("system can't add a placeless visit", () => {
    const doc = edit(kazbegiDoc(), N.hike, {
      placeId: null,
      lonLat: [44.6205, 42.6621],
    });
    assert.ok(
      rules(validateDay(doc, DAY, ctx("system"))).includes("error:tier"),
    );
    assert.deepEqual(only(validateDay(doc, DAY, ctx("user")), "tier"), []);
  });
});

describe("window, pace, hours-unknown", () => {
  test("a node after the trip ends", () => {
    const doc = kazbegiDoc();
    doc.trip.endsAt = at(DAY, "20:00");
    const [v] = only(validateDay(doc, DAY, ctx()), "window");
    assert.deepEqual(v.nodeIds, [N.dinner]);
  });

  test("the same day is too full for a relaxed pace (a warning)", () => {
    // 4h15 of sightseeing and driving; meals don't count.
    const doc = kazbegiDoc();
    doc.trip.pace = "relaxed";
    assert.deepEqual(rules(validateDay(doc, DAY, ctx())), ["warning:pace"]);
  });

  test("a place with no hours is a warning", () => {
    const doc = edit(kazbegiDoc(), N.dinner, { placeId: P.noHours });
    assert.deepEqual(rules(validateDay(doc, DAY, ctx("user"))), [
      "warning:hours-unknown",
    ]);
  });
});

describe("affectedDays", () => {
  const change = (nodes: string[], trip = false) => ({
    nodes: new Set(nodes),
    trip,
  });

  test("a node moved across days re-validates both days", () => {
    const before = kazbegiDoc();
    const after = edit(kazbegiDoc(), N.hike, {
      startsAt: at("2026-09-17", "10:00"),
    });
    assert.deepEqual(affectedDays(before, after, change([N.hike])), [
      DAY,
      "2026-09-17",
    ]);
  });

  test("changing a stay re-validates every later day (it's their base)", () => {
    const before = kazbegiDoc();
    before.nodes["20000000-0000-4000-8000-0000000000aa"] = {
      ...before.nodes[N.breakfast],
      startsAt: at("2026-09-18", "09:00"),
    };
    const after = structuredClone(before);
    assert.deepEqual(affectedDays(before, after, change([N.stayGudauri])), [
      PREV,
      DAY,
      "2026-09-18",
    ]);
  });

  test("a trip-level change re-validates every day", () => {
    const doc = kazbegiDoc();
    assert.deepEqual(affectedDays(doc, doc, change([], true)), [PREV, DAY]);
  });
});

describe("newViolations", () => {
  test("ignores violations that were already there", () => {
    const broken = edit(kazbegiDoc(), N.lunch, { startsAt: at(DAY, "11:30") });
    const worse = edit(structuredClone(broken), N.dinner, {
      startsAt: at(DAY, "22:00"),
    });
    const introduced = newViolations(
      validateDay(broken, DAY, ctx()),
      validateDay(worse, DAY, ctx()),
    );
    assert.deepEqual(rules(introduced), ["error:closed"]);
  });
});

describe("validateProposal", () => {
  const moveHike = (hhmm: string): PatchOp[] => [
    { op: "test", path: `/nodes/${N.hike}/startsAt`, value: at(DAY, "16:00") },
    { op: "replace", path: `/nodes/${N.hike}/startsAt`, value: at(DAY, hhmm) },
  ];

  test("the canonical rain move — hike to 11:30 — collides with the drive", () => {
    const result = validateProposal(
      kazbegiDoc(),
      moveHike("11:30"),
      ctx("intervention"),
    );
    assert.equal(result.ok, false);
    if (result.ok || result.kind !== "violations")
      throw new Error("expected violations");
    assert.ok(rules(result.blocking).includes("error:overlap"));
  });

  test("a clean move is accepted, with the inverse to undo it", () => {
    const result = validateProposal(
      kazbegiDoc(),
      moveHike("15:30"),
      ctx("intervention"),
    );
    assert.ok(result.ok);
    assert.equal(result.doc.nodes[N.hike].startsAt, at(DAY, "15:30"));
    assert.deepEqual(result.inverse, [
      {
        op: "replace",
        path: `/nodes/${N.hike}/startsAt`,
        value: at(DAY, "16:00"),
      },
    ]);
  });

  test("a fix on an already-broken day is accepted", () => {
    const broken = edit(kazbegiDoc(), N.lunch, { startsAt: at(DAY, "11:30") });
    const result = validateProposal(
      broken,
      [
        {
          op: "replace",
          path: `/nodes/${N.lunch}/startsAt`,
          value: at(DAY, "12:30"),
        },
      ],
      ctx("system"),
    );
    assert.ok(result.ok);
  });

  test("a user edit that breaks the day is applied, with warnings", () => {
    const result = validateProposal(
      kazbegiDoc(),
      moveHike("11:30"),
      ctx("user"),
    );
    assert.ok(result.ok);
    assert.ok(rules(result.introduced).includes("error:overlap"));
  });

  test("a user edit is still blocked on an unknown place", () => {
    const result = validateProposal(
      kazbegiDoc(),
      [
        {
          op: "replace",
          path: `/nodes/${N.dinner}/placeId`,
          value: "10000000-0000-4000-8000-0000000000ff",
        },
      ],
      ctx("user"),
    );
    assert.equal(result.ok, false);
  });

  test("a stale proposal fails its test op", () => {
    const moved = edit(kazbegiDoc(), N.hike, { startsAt: at(DAY, "15:00") });
    const result = validateProposal(
      moved,
      moveHike("15:30"),
      ctx("intervention"),
    );
    assert.equal(result.ok, false);
    if (result.ok || result.kind !== "patch")
      throw new Error("expected patch error");
    assert.equal(result.error.code, "test-failed");
  });

  test("ops outside the grammar are rejected before anything applies", () => {
    const result = validateProposal(
      kazbegiDoc(),
      [{ op: "replace", path: `/nodes/${N.hike}/geom`, value: "POINT(0 0)" }],
      ctx("user"),
    );
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("unreachable");
    assert.equal(result.kind, "invalid");
  });
});
