import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyOps } from "./patch.ts";
import { draftSuggestions, readPicks, type SwapCandidate } from "./suggest.ts";
import { at, DAY, kazbegiDoc, N, P, places } from "./test-fixtures.ts";
import { straightLineTravel } from "./travel.ts";
import { validateProposal } from "./validate.ts";

const ctx = { places, travel: straightLineTravel };

const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

const swapCandidate = (
  id: string,
  over: Partial<SwapCandidate> = {},
): SwapCandidate => ({
  id,
  name: "Verified café",
  category: "cafe",
  group: "food",
  tier: "verified",
  lonLat: places.get(id)?.lonLat ?? [44.644, 42.659],
  outdoor: false,
  distanceM: 300,
  ...over,
});

/** Every draft must be something that can be applied, and must leave the day coherent. */
function assertSound(
  doc = kazbegiDoc(),
  drafts: ReturnType<typeof draftSuggestions>,
) {
  for (const d of drafts) {
    const result = validateProposal(doc, d.ops, { ...ctx, author: "user" });
    assert.ok(result.ok, `${d.id} applies`);
    const errors = result.ok
      ? result.introduced.filter((v) => v.severity === "error")
      : [];
    assert.deepEqual(errors, [], `${d.id} introduces no error`);
  }
}

describe("another time", () => {
  test("offers an earlier and a later start that need nothing else moved", () => {
    const doc = kazbegiDoc();
    const drafts = draftSuggestions(doc, N.hike, [], ctx).filter(
      (d) => d.kind === "time",
    );
    assert.ok(drafts.length >= 1);
    assertSound(doc, drafts);
    const starts = drafts.map((d) =>
      clock(applyOps(doc, d.ops).doc.nodes[N.hike].startsAt),
    );
    assert.ok(
      starts.every((s) => s !== "16:00"),
      "never the time it already has",
    );
  });

  test("never offers a time that ends after dark", () => {
    const doc = kazbegiDoc();
    const drafts = draftSuggestions(doc, N.hike, [], ctx).filter(
      (d) => d.kind === "time",
    );
    for (const d of drafts) {
      const after = applyOps(doc, d.ops).doc.nodes[N.hike];
      const end = Date.parse(after.startsAt) + after.durationMin * 60_000;
      // Dusk at Kazbegi in mid-September is about 19:30.
      assert.ok(
        end <= Date.parse(at(DAY, "19:30")),
        `${d.id} ends before dark`,
      );
    }
  });

  test("says what it changes, in the times a traveller reads", () => {
    const doc = kazbegiDoc();
    const [first] = draftSuggestions(doc, N.hike, [], ctx).filter(
      (d) => d.kind === "time",
    );
    assert.match(first.changes[0], /^Start 16:00 → \d\d:\d\d$/);
    assert.match(first.title, /^Start at \d\d:\d\d instead$/);
  });

  test("a start that would push other stops says which, and how far", () => {
    const doc = kazbegiDoc();
    const drafts = draftSuggestions(doc, N.lunch, [], ctx).filter(
      (d) => d.kind === "time" && d.moves.length > 0,
    );
    for (const d of drafts) {
      assert.match(d.moves[0], /\d\d:\d\d → \d\d:\d\d/);
    }
  });

  test("prefers a window clear of rain for a stop in the open", () => {
    const doc = kazbegiDoc();
    // Lunch (in the open) runs 12:30–13:45 and it rains at noon: a start after
    // the rain is offered, and says so.
    const wet = new Set([12]);
    const drafts = draftSuggestions(doc, N.lunch, [], { ...ctx, wet }).filter(
      (d) => d.kind === "time",
    );
    const dry = drafts.filter((d) => /rain/i.test(d.reason));
    assert.ok(dry.length >= 1);
    assertSound(doc, dry);
  });
});

describe("another length", () => {
  const categories = new Map([
    [P.friendship, "monument"],
    [P.gergeti, "christian_place_of_worship"],
  ]);

  test("forty minutes at a monument is offered the usual twenty, as a change that holds", () => {
    const doc = kazbegiDoc();
    const out = draftSuggestions(doc, N.friendship, [], {
      ...ctx,
      categories,
    }).filter((d) => d.kind === "length");
    assert.equal(out.length, 1);
    assert.equal(out[0].title, "Make it 20 min");
    assert.deepEqual(out[0].changes, ["Takes 40 min → 20 min"]);
    assertSound(doc, out);
  });

  test("a hike is not offered the length of a church visit", () => {
    const doc = kazbegiDoc();
    const out = draftSuggestions(doc, N.hike, [], {
      ...ctx,
      categories,
    }).filter((d) => d.kind === "length");
    assert.deepEqual(out, []);
  });

  test("without categories, no change of length", () => {
    const doc = kazbegiDoc();
    assert.deepEqual(
      draftSuggestions(doc, N.friendship, [], ctx).filter(
        (d) => d.kind === "length",
      ),
      [],
    );
  });
});

describe("another place", () => {
  test("offers an open place of the same kind, as ops that swap it in", () => {
    const doc = kazbegiDoc();
    const drafts = draftSuggestions(
      doc,
      N.lunch,
      [swapCandidate(P.verifiedCafe)],
      ctx,
    ).filter((d) => d.kind === "swap");
    assert.equal(drafts.length, 1);
    assertSound(doc, drafts);
    const after = applyOps(doc, drafts[0].ops).doc.nodes[N.lunch];
    assert.equal(after.placeId, P.verifiedCafe);
    assert.equal(after.meta.title, "Lunch · Verified café");
  });

  test("never offers a place that is closed when the stop is", () => {
    const doc = kazbegiDoc();
    // The museum is closed on Wednesdays, which is DAY.
    const drafts = draftSuggestions(
      doc,
      N.lunch,
      [
        swapCandidate(P.museum, {
          name: "Kazbegi museum",
          category: "museum",
          group: "culture",
        }),
      ],
      ctx,
    ).filter((d) => d.kind === "swap");
    assert.deepEqual(drafts, []);
  });

  test("never offers a place that is already in the trip", () => {
    const doc = kazbegiDoc();
    const drafts = draftSuggestions(
      doc,
      N.lunch,
      [swapCandidate(P.cafe5047, { name: "Cafe 5047m" })],
      ctx,
    ).filter((d) => d.kind === "swap");
    assert.deepEqual(drafts, []);
  });

  test("never offers a place the user's changes could not use (an unchecked one)", () => {
    const doc = kazbegiDoc();
    const drafts = draftSuggestions(
      doc,
      N.lunch,
      [swapCandidate(P.rawBar, { tier: "raw" })],
      ctx,
    ).filter((d) => d.kind === "swap");
    assert.deepEqual(drafts, []);
  });
});

describe("only stops that are somewhere", () => {
  test("a drive or a check-in is not something to swap or reschedule at will", () => {
    const doc = kazbegiDoc();
    assert.deepEqual(draftSuggestions(doc, N.drive, [], ctx), []);
    assert.deepEqual(draftSuggestions(doc, N.stayKazbegi, [], ctx), []);
  });
});

describe("readPicks", () => {
  const valid = new Set(["a", "b", "c", "d"]);

  test("keeps the ones named, in the model's order, with their reasons", () => {
    const picks = readPicks(
      {
        picks: [
          { id: "b", reason: "Dry." },
          { id: "a", reason: "Quiet." },
        ],
      },
      valid,
    );
    assert.deepEqual(picks, [
      { id: "b", reason: "Dry." },
      { id: "a", reason: "Quiet." },
    ]);
  });

  test("drops an id it was never given", () => {
    assert.deepEqual(
      readPicks(
        {
          picks: [
            { id: "zzz", reason: "x" },
            { id: "a", reason: "y" },
          ],
        },
        valid,
      ),
      [{ id: "a", reason: "y" }],
    );
  });

  test("keeps at most three, and each once", () => {
    const many = ["a", "b", "c", "d", "a"].map((id) => ({ id, reason: "r" }));
    assert.deepEqual(
      readPicks({ picks: many }, valid)?.map((p) => p.id),
      ["a", "b", "c"],
    );
  });

  test("anything that is not the schema is null", () => {
    assert.equal(readPicks({ nope: 1 }, valid), null);
    assert.equal(readPicks("text", valid), null);
    assert.equal(readPicks({ picks: [{ id: "a" }] }, valid), null);
  });
});
