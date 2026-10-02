import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  orderTrips,
  pickFeatured,
  startsIn,
  stateOf,
} from "./trip-picker-model.ts";

const trip = (id: string, from: string, to: string) => ({
  id,
  startsAt: `${from}T09:00:00+04:00`,
  endsAt: `${to}T21:00:00+04:00`,
});

const TODAY = "2026-10-02";

const live = trip("live", "2026-10-01", "2026-10-05");
const soon = trip("soon", "2026-10-10", "2026-10-14");
const later = trip("later", "2026-12-01", "2026-12-07");
const ended = trip("ended", "2026-09-01", "2026-09-06");
const longAgo = trip("long-ago", "2026-03-01", "2026-03-04");

describe("stateOf", () => {
  test("on the day it starts and the day it ends, a trip is live", () => {
    assert.equal(stateOf(trip("a", "2026-10-02", "2026-10-04"), TODAY), "live");
    assert.equal(stateOf(trip("b", "2026-09-30", "2026-10-02"), TODAY), "live");
  });

  test("before it starts it is upcoming, after it ends it is finished", () => {
    assert.equal(stateOf(soon, TODAY), "upcoming");
    assert.equal(stateOf(ended, TODAY), "finished");
  });
});

describe("orderTrips", () => {
  const all = [longAgo, later, ended, soon, live];

  test("live first, then the next to start, then the ones that are over, latest first", () => {
    assert.deepEqual(
      orderTrips(all, TODAY).map((t) => t.id),
      ["live", "soon", "later", "ended", "long-ago"],
    );
  });

  test("carries each trip's state with it", () => {
    const states = Object.fromEntries(
      orderTrips(all, TODAY).map((t) => [t.id, t.state]),
    );
    assert.deepEqual(states, {
      live: "live",
      soon: "upcoming",
      later: "upcoming",
      ended: "finished",
      "long-ago": "finished",
    });
  });
});

describe("pickFeatured", () => {
  const ordered = orderTrips([ended, later, soon], TODAY);

  test("with nothing live, the first upcoming trip", () => {
    assert.equal(pickFeatured(ordered)?.id, "soon");
  });

  test("a live trip comes before an upcoming one", () => {
    assert.equal(pickFeatured(orderTrips([soon, live], TODAY))?.id, "live");
  });

  test("with only finished trips, the most recent", () => {
    assert.equal(
      pickFeatured(orderTrips([longAgo, ended], TODAY))?.id,
      "ended",
    );
  });

  test("the traveller's own choice wins, if it is one of theirs", () => {
    assert.equal(pickFeatured(ordered, "ended")?.id, "ended");
  });

  test("a choice that is not theirs is no choice", () => {
    assert.equal(pickFeatured(ordered, "someone-elses")?.id, "soon");
    assert.equal(pickFeatured(ordered, "")?.id, "soon");
  });

  test("no trips, no featured trip", () => {
    assert.equal(pickFeatured([]), null);
  });
});

describe("startsIn", () => {
  const at = (from: string) => startsIn(from, TODAY);

  test("says today, tomorrow, then days, then weeks", () => {
    assert.equal(at("2026-10-02"), "Starts today");
    assert.equal(at("2026-10-03"), "Starts tomorrow");
    assert.equal(at("2026-10-10"), "Starts in 8 days");
    assert.equal(at("2026-10-30"), "Starts in 4 weeks");
    assert.equal(at("2026-11-07"), "Starts in 5 weeks");
  });

  test("a start already behind is no countdown", () => {
    assert.equal(at("2026-10-01"), "");
  });
});
