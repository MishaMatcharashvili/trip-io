import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  decide,
  type GoldLabel,
  noticeText,
  type Prediction,
  parseNotices,
  scoreSpike,
  vetRoadClaim,
} from "./road-notice.ts";

const API = {
  items: {
    data: [
      {
        id: 5276,
        slug: "darial",
        publish_date: "2026-09-25 08:40:11",
        restriction_status: "1",
        translates: [
          {
            language: "ka",
            title:
              "მცხეთა-სტეფანწმინდა-ლარსის გზაზე დარიალის ხეობაში მოძრაობა აკრძალულია",
            content:
              "<p>მოძრაობა აკრძალულია&nbsp;ყველა ტიპის ავტოტრანსპორტისთვის.</p>",
          },
        ],
      },
      {
        id: 1,
        slug: "bad",
        publish_date: "nope",
        restriction_status: "9",
        translates: [],
      },
    ],
  },
};

describe("parseNotices", () => {
  test("reads a page, in Tbilisi time, and skips what does not parse", () => {
    const [only, ...rest] = parseNotices(API);
    assert.equal(rest.length, 0);
    assert.equal(only.id, 5276);
    assert.equal(only.status, "restriction");
    assert.equal(only.publishedAt, "2026-09-25T04:40:11.000Z");
    assert.match(only.body, /^მოძრაობა აკრძალულია ყველა/);
  });

  test("garbage is no notices", () => {
    assert.deepEqual(parseNotices(null), []);
    assert.deepEqual(parseNotices({ items: {} }), []);
  });
});

const notice = parseNotices(API)[0];
const text = noticeText(notice);
const QUOTE = "დარიალის ხეობაში მოძრაობა აკრძალულია";

describe("vetRoadClaim", () => {
  test("a closure on a corridor passes", () => {
    const r = vetRoadClaim(
      { corridor: "military-road", condition: "closed", quote: QUOTE },
      { text, status: "restriction" },
    );
    assert.deepEqual(r, {
      ok: true,
      claim: { corridor: "military-road", condition: "closed" },
    });
  });

  test("a restored notice read as a reopening passes", () => {
    const r = vetRoadClaim(
      { corridor: "military-road", condition: "reopened", quote: QUOTE },
      { text, status: "restored" },
    );
    assert.deepEqual(r, {
      ok: true,
      claim: { corridor: "military-road", condition: "reopened" },
    });
  });

  test("status and text disagreeing either way is refused, not resolved", () => {
    // The department coded notice 5244 "restored" for a text that says trailers
    // will be restricted; a "reopened" there would end real events.
    for (const [status, condition] of [
      ["restored", "restricted"],
      ["restriction", "reopened"],
      ["partial", "reopened"],
    ] as const) {
      assert.deepEqual(
        vetRoadClaim(
          { corridor: "military-road", condition, quote: QUOTE },
          { text, status },
        ),
        { ok: false, reason: "contradicts-status" },
        `${status} / ${condition}`,
      );
    }
  });

  test("a restriction read as a delay contradicts the department", () => {
    assert.deepEqual(
      vetRoadClaim(
        { corridor: "military-road", condition: "delays", quote: QUOTE },
        { text, status: "restriction" },
      ),
      { ok: false, reason: "contradicts-status" },
    );
  });

  test("a partial notice read as a full closure contradicts the department", () => {
    assert.deepEqual(
      vetRoadClaim(
        { corridor: "military-road", condition: "closed", quote: QUOTE },
        { text, status: "partial" },
      ),
      { ok: false, reason: "contradicts-status" },
    );
  });

  test("an invented corridor, a quote not in the notice, and nonsense are refused", () => {
    const ctx = { text, status: "restriction" as const };
    assert.equal(
      vetRoadClaim(
        { corridor: "silk-road", condition: "closed", quote: QUOTE },
        ctx,
      ).ok,
      false,
    );
    assert.deepEqual(
      vetRoadClaim(
        { corridor: null, condition: "closed", quote: "ეს არ წერია" },
        ctx,
      ),
      { ok: false, reason: "quote-not-in-source" },
    );
    assert.deepEqual(vetRoadClaim("no", ctx), {
      ok: false,
      reason: "malformed",
    });
  });

  test("a notice that is not about a road claims nothing, and needs no quote", () => {
    const r = vetRoadClaim(
      { corridor: null, condition: "none", quote: "" },
      { text, status: "partial" },
    );
    assert.deepEqual(r, {
      ok: true,
      claim: { corridor: null, condition: "none" },
    });
  });
});

describe("scoreSpike and decide", () => {
  const gold = (
    id: number,
    corridor: string | null,
    condition: GoldLabel["condition"],
  ): GoldLabel => ({
    id,
    corridor: [corridor],
    condition,
  });
  const got = (
    id: number,
    corridor: string | null,
    condition: "closed" | "reopened" | "restricted" | "none",
  ): Prediction => ({
    id,
    claim: { corridor, condition },
  });

  test("counts recall, precision and condition separately", () => {
    const labels = [
      gold(1, "military-road", "closed"),
      gold(2, "tusheti", "restricted"),
      gold(3, null, "closed"),
      gold(4, "zagari-pass", "reopened"),
    ];
    const score = scoreSpike(labels, [
      got(1, "military-road", "closed"),
      got(2, "military-road", "restricted"),
      got(3, null, "closed"),
      { id: 4, claim: null, rejection: "contradicts-status" },
    ]);
    assert.equal(score.total, 4);
    assert.equal(score.onCorridor, 3);
    assert.equal(score.recalled, 1);
    assert.equal(score.claimedOnCorridor, 2);
    assert.equal(score.claimedCorrectly, 1);
    assert.equal(score.conditionScored, 3);
    assert.equal(score.conditionCorrect, 2);
    assert.equal(score.rejected, 1);
    assert.deepEqual(
      score.misses.map((m) => m.id),
      [2, 4],
    );
  });

  test("an acceptable-set label takes any of its corridors", () => {
    const label: GoldLabel = {
      id: 1,
      corridor: ["kutaisi-batumi", "east-west-highway"],
      condition: "closed",
    };
    assert.equal(
      scoreSpike([label], [got(1, "east-west-highway", "closed")])
        .corridorCorrect,
      1,
    );
    assert.equal(
      scoreSpike([label], [got(1, "tusheti", "closed")]).corridorCorrect,
      0,
    );
  });

  test("too few labels is insufficient data, however good", () => {
    const score = scoreSpike(
      [gold(1, "military-road", "closed")],
      [got(1, "military-road", "closed")],
    );
    assert.equal(decide(score).decision, "insufficient-data");
  });

  test("the rule automates a good run and keeps a bad one manual", () => {
    const labels = Array.from({ length: 20 }, (_, i) =>
      gold(i, "military-road", "closed"),
    );
    const good = scoreSpike(
      labels,
      labels.map((l) => got(l.id, "military-road", "closed")),
    );
    assert.equal(decide(good).decision, "automate");
    const bad = scoreSpike(
      labels,
      labels.map((l, i) =>
        got(l.id, i < 10 ? "military-road" : "tusheti", "closed"),
      ),
    );
    const verdict = decide(bad);
    assert.equal(verdict.decision, "stay-manual");
    assert.match(verdict.why, /recall/);
  });
});
