import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isOpenAt,
  isOpenThroughout,
  type OpeningHours,
  openingHours,
  parseDayText,
  tbilisiTime,
} from "./opening-hours.ts";

const closed = [] as { open: string; close: string }[];
const week = (
  intervals: { open: string; close: string }[],
  overrides: Partial<Record<string, { open: string; close: string }[]>> = {},
): OpeningHours => ({
  kind: "weekly",
  days: {
    mon: intervals,
    tue: intervals,
    wed: intervals,
    thu: intervals,
    fri: intervals,
    sat: intervals,
    sun: intervals,
    ...overrides,
  },
});

const at = (
  weekday: "mon" | "tue" | "sat" | "sun",
  time: string,
  month = 7,
) => {
  const [h, m] = time.split(":").map(Number);
  return { weekday, minutes: h * 60 + m, month };
};

describe("isOpenAt", () => {
  const museum = week([{ open: "10:00", close: "18:00" }], { mon: closed });

  test("inside and outside a daytime interval", () => {
    assert.equal(isOpenAt(museum, at("tue", "10:00")), true);
    assert.equal(isOpenAt(museum, at("tue", "17:59")), true);
    assert.equal(isOpenAt(museum, at("tue", "18:00")), false);
    assert.equal(isOpenAt(museum, at("tue", "09:59")), false);
  });

  test("a day with no intervals is closed", () => {
    assert.equal(isOpenAt(museum, at("mon", "12:00")), false);
  });

  test("split shifts", () => {
    const lunch = week([
      { open: "12:00", close: "15:00" },
      { open: "18:00", close: "23:00" },
    ]);
    assert.equal(isOpenAt(lunch, at("sat", "16:00")), false);
    assert.equal(isOpenAt(lunch, at("sat", "19:00")), true);
  });

  test("overnight intervals carry into the next morning", () => {
    const bar = week(closed, { sat: [{ open: "20:00", close: "03:00" }] });
    assert.equal(isOpenAt(bar, at("sat", "23:30")), true);
    assert.equal(isOpenAt(bar, at("sun", "02:59")), true);
    assert.equal(isOpenAt(bar, at("sun", "03:00")), false);
    // Not open Saturday early morning: that would need Friday's interval.
    assert.equal(isOpenAt(bar, at("sat", "01:00")), false);
  });

  test("24:00 closes at midnight", () => {
    const late = week([{ open: "18:00", close: "24:00" }]);
    assert.equal(isOpenAt(late, at("tue", "23:59")), true);
    assert.equal(isOpenAt(late, at("tue", "00:30")), false);
  });

  test("season limits both kinds", () => {
    const tusheti: OpeningHours = { kind: "always", months: [6, 7, 8, 9] };
    assert.equal(isOpenAt(tusheti, at("tue", "12:00", 7)), true);
    assert.equal(isOpenAt(tusheti, at("tue", "12:00", 11)), false);

    const seasonal = { ...museum, months: [5, 6] } as OpeningHours;
    assert.equal(isOpenAt(seasonal, at("tue", "12:00", 5)), true);
    assert.equal(isOpenAt(seasonal, at("tue", "12:00", 8)), false);
  });

  test("always open", () => {
    assert.equal(isOpenAt({ kind: "always" }, at("sun", "03:00")), true);
  });
});

describe("openingHours schema", () => {
  test("requires all seven days for weekly", () => {
    const { sun: _, ...sixDays } = museumDays();
    assert.equal(
      openingHours.safeParse({ kind: "weekly", days: sixDays }).success,
      false,
    );
    assert.equal(
      openingHours.safeParse({ kind: "weekly", days: museumDays() }).success,
      true,
    );
  });

  test("rejects malformed times and zero-length intervals", () => {
    const days = { ...museumDays(), tue: [{ open: "9:00", close: "18:00" }] };
    assert.equal(
      openingHours.safeParse({ kind: "weekly", days }).success,
      false,
    );
    const same = { ...museumDays(), tue: [{ open: "10:00", close: "10:00" }] };
    assert.equal(
      openingHours.safeParse({ kind: "weekly", days: same }).success,
      false,
    );
  });

  function museumDays() {
    const i = [{ open: "10:00", close: "18:00" }];
    return { mon: [], tue: i, wed: i, thu: i, fri: i, sat: i, sun: i };
  }
});

describe("tbilisiTime", () => {
  test("is UTC+4", () => {
    // Wednesday 16 Sep 2026, 08:30 UTC.
    assert.deepEqual(tbilisiTime(new Date("2026-09-16T08:30:00Z")), {
      weekday: "wed",
      minutes: 12 * 60 + 30,
      month: 9,
    });
  });

  test("crosses midnight into the next local day", () => {
    assert.deepEqual(tbilisiTime(new Date("2026-12-31T21:15:00Z")), {
      weekday: "fri",
      minutes: 1 * 60 + 15,
      month: 1,
    });
  });
});

describe("parseDayText", () => {
  test("full and short forms", () => {
    assert.deepEqual(parseDayText("09:00-18:00"), {
      ok: true,
      intervals: [{ open: "09:00", close: "18:00" }],
    });
    assert.deepEqual(parseDayText("10-14, 15:30–22"), {
      ok: true,
      intervals: [
        { open: "10:00", close: "14:00" },
        { open: "15:30", close: "22:00" },
      ],
    });
  });

  test("closed", () => {
    assert.deepEqual(parseDayText("Closed"), { ok: true, intervals: [] });
  });

  test("errors name the bad part", () => {
    const result = parseDayText("10:00-18:00, lunch");
    assert.equal(result.ok, false);
    assert.match((result as { error: string }).error, /lunch/);
    assert.equal(parseDayText("25:00-26:00").ok, false);
  });
});

describe("isOpenThroughout", () => {
  // 2026-09-15 is a Tuesday; instants are Tbilisi wall-clock (UTC+4).
  const t = (hhmm: string, day = "2026-09-15") =>
    new Date(`${day}T${hhmm}:00+04:00`);
  const museum = week([{ open: "10:00", close: "18:00" }], { mon: closed });

  test("a visit inside opening hours", () => {
    assert.equal(isOpenThroughout(museum, t("10:00"), t("18:00")), true);
  });

  test("a visit that runs past closing", () => {
    assert.equal(isOpenThroughout(museum, t("17:00"), t("18:05")), false);
  });

  test("a visit that starts before opening", () => {
    assert.equal(isOpenThroughout(museum, t("09:55"), t("11:00")), false);
  });

  test("a lunch break in the middle", () => {
    const split = week([
      { open: "10:00", close: "13:00" },
      { open: "14:00", close: "18:00" },
    ]);
    assert.equal(isOpenThroughout(split, t("12:00"), t("15:00")), false);
    assert.equal(isOpenThroughout(split, t("14:00"), t("15:00")), true);
  });

  test("an overnight interval carries across midnight", () => {
    const bar = week([{ open: "20:00", close: "02:00" }]);
    assert.equal(
      isOpenThroughout(bar, t("23:00"), t("01:30", "2026-09-16")),
      true,
    );
    assert.equal(
      isOpenThroughout(bar, t("23:00"), t("02:30", "2026-09-16")),
      false,
    );
  });

  test("closed day", () => {
    assert.equal(
      isOpenThroughout(
        museum,
        t("12:00", "2026-09-14"),
        t("13:00", "2026-09-14"),
      ),
      false,
    );
  });
});
