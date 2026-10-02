import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { TripScreen } from "../bll/trip-screen.ts";
import {
  at,
  DAY,
  kazbegiDoc,
  N,
  P,
  places,
} from "../domain/trip/test-fixtures.ts";
import {
  changeRows,
  dateRange,
  mapStops,
  partyLine,
  stopDetail,
  tripModel,
  weatherView,
} from "./trip-model.ts";

// The fixture Kazbegi day, as the trip screen's read model would hand it over.
function screen(patch: Partial<TripScreen> = {}): TripScreen {
  const doc = kazbegiDoc();
  const positions = Object.fromEntries(
    Object.entries(doc.nodes).map(([id, node]) => [
      id,
      node.placeId
        ? (places.get(node.placeId)?.lonLat ?? [0, 0])
        : (node.lonLat ?? [0, 0]),
    ]),
  );
  return {
    id: "10000000-0000-4000-8000-00000000abcd",
    doc,
    head: null,
    seq: 1,
    violations: [],
    places: {},
    positions,
    matches: [],
    events: [],
    alerts: { title: "", alerts: [], told: 0, applied: 0, kept: 0, checks: 0 },
    history: [],
    watch: null,
    lastCheck: null,
    before: null,
    ...patch,
  } as TripScreen;
}

const noon = new Date(at(DAY, "12:45"));

describe("tripModel", () => {
  test("one day per calendar day, today found by the clock", () => {
    const trip = tripModel(screen(), noon);
    assert.equal(trip.dayCount, 7);
    assert.equal(trip.currentDay, 3);
    assert.deepEqual(
      trip.days.map((d) => d.state),
      ["past", "past", "today", "future", "future", "future", "future"],
    );
    assert.equal(trip.days[2].stamp, "D3 · WED 16 · TODAY");
  });

  test("a stop is done, now or upcoming by its own times", () => {
    const today = tripModel(screen(), noon).days[2];
    const state = (id: string) =>
      today.checkpoints.find((c) => c.id === id)?.state;
    assert.equal(state(N.friendship), "done");
    assert.equal(state(N.lunch), "now");
    assert.equal(state(N.hike), "upcoming");
  });

  test("the route names the move between bases", () => {
    const trip = tripModel(screen(), noon);
    assert.equal(trip.days[1].route, "Rooms Gudauri");
    assert.equal(trip.days[2].route, "Rooms Gudauri → Rooms Kazbegi");
  });

  test("a live match marks its stop, and only its stop, as a conflict", () => {
    const trip = tripModel(
      screen({
        matches: [
          {
            nodeId: N.hike,
            kind: "weather.rain",
            severity: "moderate",
            route: "interrupt",
            validFrom: at(DAY, "15:30"),
            validTo: at(DAY, "19:00"),
            judgedAt: at(DAY, "12:00"),
          },
        ],
      }),
      noon,
    );
    const today = trip.days[2];
    const conflicted = today.checkpoints.filter((c) => c.conflict);
    assert.deepEqual(
      conflicted.map((c) => c.id),
      [N.hike],
    );
    assert.equal(conflicted[0].conflict, "Weather · rain 15:30–19:00");
    assert.deepEqual(today.watch, { tone: "alert", label: "1 to check" });
    assert.ok(mapStops(today).find((s) => s.id === N.hike)?.disrupted);
  });

  test("map stops carry the node's position and drop meal prefixes", () => {
    const today = tripModel(screen(), noon).days[2];
    const lunch = mapStops(today).find((s) => s.id === N.lunch);
    assert.equal(lunch?.label, "Zeta Camp");
    assert.deepEqual(lunch?.lonLat, places.get(P.zetaCamp)?.lonLat);
  });

  test("map stops carry the place's category, and a logo only from its own site", () => {
    const card = (website: string | null) => ({
      id: P.zetaCamp,
      name: "Zeta Camp",
      nameKa: null,
      category: "restaurant",
      tier: "curated" as const,
      lonLat: places.get(P.zetaCamp)?.lonLat ?? ([0, 0] as [number, number]),
      openingHours: null,
      address: null,
      website,
      phone: null,
    });
    const lunch = (website: string | null) =>
      mapStops(
        tripModel(screen({ places: { [P.zetaCamp]: card(website) } }), noon)
          .days[2],
      ).find((s) => s.id === N.lunch);

    const own = lunch("https://zetacamp.ge");
    assert.equal(own?.kind, "meal");
    assert.equal(own?.category, "restaurant");
    assert.equal(own?.logo, `/api/places/${P.zetaCamp}/logo`);
    assert.equal(lunch("https://facebook.com/zetacamp")?.logo, undefined);
    assert.equal(lunch(null)?.logo, undefined);
  });
});

describe("labels", () => {
  test("date ranges within and across a month", () => {
    assert.equal(
      dateRange(at("2026-09-14", "00:00"), at("2026-09-20", "23:59")),
      "14 – 20 September",
    );
    assert.equal(
      dateRange(at("2026-09-28", "00:00"), at("2026-10-02", "23:59")),
      "28 Sept – 2 Oct",
    );
  });

  test("party", () => {
    assert.equal(partyLine({ adults: 1 }), "Travelling solo");
    assert.equal(partyLine({ adults: 2, children: 1 }), "2 adults · 1 child");
  });
});

describe("changeRows", () => {
  test("one row per node the patch touched", () => {
    const before = kazbegiDoc();
    const after = kazbegiDoc();
    after.nodes[N.hike] = {
      ...after.nodes[N.hike],
      startsAt: at(DAY, "11:30"),
    };
    delete after.nodes[N.dinner];
    assert.deepEqual(changeRows(before, after), [
      { from: "16:00 Gergeti Trinity hike", to: "11:30 Gergeti Trinity hike" },
      { from: "19:30 Dinner · Cafe 5047m", to: "Removed" },
    ]);
  });
});

describe("weatherView", () => {
  const hour = (hhmm: string, precipitation: number) => ({
    at: at(DAY, hhmm),
    precipitation,
    apparentTemperature: 14,
  });

  test("names the wet window in coral", () => {
    const view = weatherView([
      hour("07:00", 3),
      hour("14:00", 0),
      hour("15:00", 1.5),
      hour("16:00", 4.5),
      hour("17:00", 0),
    ]);
    assert.equal(view?.hours.length, 4);
    assert.equal(view?.caption, "Rain 15:00–17:00 · 6.0 mm");
    assert.equal(view?.captionTone, "alert");
  });

  test("dry is said plainly", () => {
    const view = weatherView([hour("09:00", 0), hour("10:00", 0.1)]);
    assert.equal(view?.caption, "Dry · 14–14°C");
    assert.equal(view?.captionTone, "neutral");
  });
});

describe("stopDetail", () => {
  const node = (over: Partial<Parameters<typeof stopDetail>[0]> = {}) => ({
    kind: "visit" as const,
    startsAt: at(DAY, "11:00"),
    durationMin: 90,
    ...over,
  });

  test("a visit says how long and until when, so an overlap can be read off the rows", () => {
    assert.equal(stopDetail(node(), "museum"), "1h 30m · until 12:30 · museum");
  });

  test("a drive says when it arrives", () => {
    assert.equal(
      stopDetail(node({ kind: "transfer", durationMin: 55 }), undefined),
      "Drive · 55 min · until 11:55",
    );
  });

  test("a stay is a base, not an interval", () => {
    assert.equal(stopDetail(node({ kind: "stay" })), "Your base tonight");
  });

  test("the end is in Tbilisi's clock, across the hour", () => {
    assert.equal(
      stopDetail(node({ startsAt: at(DAY, "23:30"), durationMin: 45 })),
      "45 min · until 00:15",
    );
  });
});
