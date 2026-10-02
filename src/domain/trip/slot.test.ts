import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LonLat } from "../geo.ts";
import { suggestSlot, typicalMinutes } from "./slot.ts";
import { straightLineTravel } from "./travel.ts";

const TBILISI: LonLat = [44.8015, 41.6938];
const NEXT_DOOR: LonLat = [44.8025, 41.6945];
/** About a kilometre from TBILISI: a short walk or ride, not the same place. */
const A_KM_ON: LonLat = [44.811, 41.699];
const KAZBEGI: LonLat = [44.6436, 42.6568];

const T = (hhmm: string) => Date.parse(`2026-09-16T${hhmm}:00+04:00`);
const clock = (ms: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ms);

describe("typicalMinutes", () => {
  test("a meal is longer than a coffee, a museum longer than a viewpoint", () => {
    assert.ok(typicalMinutes("restaurant") > typicalMinutes("coffee_shop"));
    assert.ok(typicalMinutes("museum") > typicalMinutes("monument"));
  });

  test("a trail is a morning's walk, not an hour", () => {
    assert.ok(typicalMinutes("recreational_trail_or_path") >= 120);
  });

  test("what is not known still gets a length, not nothing", () => {
    assert.equal(typicalMinutes("something_unlisted"), 60);
  });

  test("every length is on a five-minute step, which is what the editor offers", () => {
    for (const c of ["museum", "cafe", "waterfall", "castle", "x"]) {
      assert.equal(typicalMinutes(c) % 5, 0);
    }
  });
});

describe("suggestSlot", () => {
  const place = { lonLat: NEXT_DOOR, category: "museum" };

  test("a day with nothing in it starts at the morning's opening", () => {
    const s = suggestSlot(
      { day: "2026-09-16", last: null, place },
      straightLineTravel,
    );
    assert.equal(clock(Date.parse(s.startsAt)), "10:00");
    assert.equal(s.durationMin, typicalMinutes("museum"));
  });

  test("after a stop it starts when that ends, plus the way and the buffer, on a five", () => {
    const s = suggestSlot(
      {
        day: "2026-09-16",
        last: { endsAt: T("11:30"), at: TBILISI },
        place: { lonLat: A_KM_ON, category: "museum" },
      },
      straightLineTravel,
    );
    const start = Date.parse(s.startsAt);
    // About a kilometre: the minimum leg and the ten-minute buffer.
    assert.ok(start >= T("11:45") && start <= T("11:50"));
    assert.equal(start % (5 * 60_000), 0);
  });

  test("the same place back to back needs no way, only the stop's own end", () => {
    const s = suggestSlot(
      {
        day: "2026-09-16",
        last: { endsAt: T("13:00"), at: NEXT_DOOR },
        place,
      },
      straightLineTravel,
    );
    assert.equal(clock(Date.parse(s.startsAt)), "13:00");
  });

  test("somewhere too far to walk is flagged: it needs a transfer, not just a later start", () => {
    const s = suggestSlot(
      {
        day: "2026-09-16",
        last: { endsAt: T("11:00"), at: TBILISI },
        place: { lonLat: KAZBEGI, category: "museum" },
      },
      straightLineTravel,
    );
    assert.ok(s.needsTransferMin && s.needsTransferMin > 30);
  });

  test("late in the day it is suggested anyway, for the traveller to judge", () => {
    const s = suggestSlot(
      {
        day: "2026-09-16",
        last: { endsAt: T("22:00"), at: TBILISI },
        place,
      },
      straightLineTravel,
    );
    assert.ok(Date.parse(s.startsAt) >= T("22:00"));
  });
});
