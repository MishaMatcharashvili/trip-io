import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sortedNodes, type TripDoc } from "./document.ts";
import { retime } from "./retime.ts";
import { at, DAY, kazbegiDoc, N, places } from "./test-fixtures.ts";
import { straightLineTravel } from "./travel.ts";
import { validateDay, validateProposal } from "./validate.ts";

const ctx = { places, travel: straightLineTravel };

const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

/** What the retimed ops do to a document, as the server would apply them. */
function apply(doc: TripDoc, ops: ReturnType<typeof retime>["ops"]) {
  const result = validateProposal(doc, ops, { ...ctx, author: "user" });
  assert.ok(result.ok, "the retimed ops apply");
  return result;
}

const errors = (doc: TripDoc) =>
  validateDay(doc, DAY, { ...ctx, author: "user" }).filter(
    (v) =>
      v.severity === "error" && (v.rule === "overlap" || v.rule === "travel"),
  );

describe("lengthening a stop", () => {
  test("pushes the next stop just far enough, and no further", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.lunch, { durationMin: 150 }, ctx);
    // Lunch now ends at 15:00. The check-in was 14:15; it moves to 15:00 plus
    // the few minutes it takes to walk there and the buffer. That crowds the
    // hike by three minutes (the climb starts 8 minutes' walk from the room),
    // so it moves to 16:05; dinner has room, and the push stops there.
    assert.deepEqual(
      out.pushed.map((p) => [p.id, clock(p.from), clock(p.to)]),
      [
        [N.stayKazbegi, "14:15", "15:15"],
        [N.hike, "16:00", "16:05"],
      ],
    );
    assert.equal(out.overflow, false);
  });

  test("the result has no overlap or travel problem, where the bare edit had one", () => {
    const doc = kazbegiDoc();
    const bare = validateProposal(
      doc,
      [{ op: "replace", path: `/nodes/${N.lunch}/durationMin`, value: 150 }],
      { ...ctx, author: "user" },
    );
    assert.ok(bare.ok && bare.introduced.some((v) => v.rule === "overlap"));

    const after = apply(
      doc,
      retime(doc, N.lunch, { durationMin: 150 }, ctx).ops,
    );
    assert.deepEqual(errors(after.doc), []);
  });

  test("a push that crowds the next stop pushes that one too, down the day", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.hike, { durationMin: 260 }, ctx);
    // The hike now ends 20:20; dinner at 19:30 moves behind it.
    assert.deepEqual(
      out.pushed.map((p) => p.id),
      [N.dinner],
    );
    assert.ok(Date.parse(out.pushed[0].to) >= Date.parse(at(DAY, "20:20")));
    const after = apply(doc, out.ops);
    assert.deepEqual(errors(after.doc), []);
  });

  test("a stop that has room is left alone, and so is everything after it", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.breakfast, { durationMin: 50 }, ctx);
    assert.deepEqual(out.pushed, []);
    assert.equal(out.ops.length, 1);
  });
});

describe("moving a stop", () => {
  test("later pushes what it now crowds, and a drive keeps starting where you are", () => {
    const doc = kazbegiDoc();
    // The viewpoint stretched to 90 minutes ends 11:45, over the 11:05 drive.
    const out = retime(doc, N.friendship, { durationMin: 90 }, ctx);
    const drive = out.pushed.find((p) => p.id === N.drive);
    // A transfer starts where you are: no walking time on top, just the end.
    assert.equal(clock(drive?.to ?? ""), "11:45");
    const after = apply(doc, out.ops);
    assert.deepEqual(errors(after.doc), []);
  });

  test("earlier crowds nothing after it", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.hike, { startsAt: at(DAY, "15:30") }, ctx);
    assert.deepEqual(out.pushed, []);
  });

  test("the day's order is the time order: the edit's own place decides what follows", () => {
    const doc = kazbegiDoc();
    // Dinner moved to 16:30 lands inside the hike (16:00–18:40): the hike is
    // before it in the new order and is not touched; nothing comes after it
    // but nothing is pushed either.
    const out = retime(doc, N.dinner, { startsAt: at(DAY, "16:30") }, ctx);
    assert.deepEqual(out.pushed, []);
  });
});

describe("the end of the day", () => {
  test("a push that would run past midnight is not made, and says so", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.hike, { durationMin: 480 }, ctx);
    assert.equal(out.overflow, true);
    // Only the traveller's own edit is offered: nothing is pushed into tomorrow.
    assert.deepEqual(out.pushed, []);
    assert.equal(out.ops.length, 1);
  });
});

describe("the edit itself", () => {
  test("is always the first op, and both of its fields are carried", () => {
    const doc = kazbegiDoc();
    const out = retime(
      doc,
      N.lunch,
      { startsAt: at(DAY, "12:45"), durationMin: 60 },
      ctx,
    );
    assert.deepEqual(out.ops.slice(0, 2), [
      {
        op: "replace",
        path: `/nodes/${N.lunch}/startsAt`,
        value: at(DAY, "12:45"),
      },
      { op: "replace", path: `/nodes/${N.lunch}/durationMin`, value: 60 },
    ]);
  });

  test("a node the document does not hold is nothing to retime", () => {
    const doc = kazbegiDoc();
    assert.throws(() => retime(doc, "nope", { durationMin: 30 }, ctx));
  });

  test("the day's stops stay in a valid order afterwards", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.lunch, { durationMin: 150 }, ctx);
    const after = apply(doc, out.ops);
    const order = sortedNodes(after.doc.nodes).map((e) => e.id);
    assert.equal(order.length, Object.keys(doc.nodes).length);
  });
});

describe("following a change of length", () => {
  const follow = { ...ctx, follow: true };
  const moves = (out: ReturnType<typeof retime>) =>
    out.pushed.map((p) => [p.id, clock(p.from), clock(p.to)]);

  test("a longer stop carries every later stop with it, though they had room", () => {
    const doc = kazbegiDoc();
    // The minimum is to clear the viewpoint, ten minutes, and the day after it
    // is left as it was.
    assert.deepEqual(
      retime(doc, N.breakfast, { durationMin: 60 }, ctx).pushed.map(
        (p) => p.id,
      ),
      [N.friendship],
    );
    const out = retime(doc, N.breakfast, { durationMin: 60 }, follow);
    assert.deepEqual(moves(out), [
      [N.friendship, "10:15", "10:30"],
      [N.drive, "11:05", "11:20"],
      [N.lunch, "12:30", "12:45"],
      [N.stayKazbegi, "14:15", "14:30"],
      [N.hike, "16:00", "16:15"],
      [N.dinner, "19:30", "19:45"],
    ]);
    assert.deepEqual(errors(apply(doc, out.ops).doc), []);
  });

  test("a shorter stop gives the time back: later stops come forward, gaps kept", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.lunch, { durationMin: 15 }, follow);
    assert.deepEqual(moves(out), [
      [N.stayKazbegi, "14:15", "13:15"],
      [N.hike, "16:00", "15:00"],
      [N.dinner, "19:30", "18:30"],
    ]);
    assert.deepEqual(errors(apply(doc, out.ops).doc), []);
  });

  test("a booked stop does not move for it, and neither does what follows", () => {
    const doc = kazbegiDoc();
    doc.nodes[N.lunch] = {
      ...doc.nodes[N.lunch],
      meta: { ...doc.nodes[N.lunch].meta, booked: true },
    };
    const out = retime(doc, N.breakfast, { durationMin: 60 }, follow);
    assert.deepEqual(
      out.pushed.map((p) => p.id),
      [N.friendship, N.drive],
    );
  });

  test("a booked stop is still pushed when it is crowded", () => {
    const doc = kazbegiDoc();
    doc.nodes[N.lunch] = {
      ...doc.nodes[N.lunch],
      meta: { ...doc.nodes[N.lunch].meta, booked: true },
    };
    const out = retime(doc, N.friendship, { durationMin: 150 }, follow);
    assert.ok(out.pushed.some((p) => p.id === N.lunch));
    assert.deepEqual(errors(apply(doc, out.ops).doc), []);
  });

  test("moving a stop without changing its length carries nothing", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.hike, { startsAt: at(DAY, "15:30") }, follow);
    assert.deepEqual(out.pushed, []);
  });

  test("it still stops at the end of the day", () => {
    const doc = kazbegiDoc();
    const out = retime(doc, N.hike, { durationMin: 480 }, follow);
    assert.equal(out.overflow, true);
    assert.deepEqual(out.pushed, []);
  });
});
