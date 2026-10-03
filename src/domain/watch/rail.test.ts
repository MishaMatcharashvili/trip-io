import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { eventDraft } from "./event.ts";
import {
  describeRail,
  railDedupeKey,
  railEventDraft,
  railReportInput,
  railRoutes,
  railWindow,
  routeLineWkt,
} from "./rail.ts";

const NOON = new Date("2030-05-01T08:00:00Z"); // 12:00 in Tbilisi

describe("railWindow", () => {
  test("today ends at Tbilisi midnight", () => {
    assert.equal(railWindow("today", NOON).validTo, "2030-05-01T20:00:00.000Z");
  });
  test("tomorrow and a week reach further", () => {
    assert.equal(
      railWindow("tomorrow", NOON).validTo,
      "2030-05-02T20:00:00.000Z",
    );
    assert.equal(railWindow("week", NOON).validTo, "2030-05-07T20:00:00.000Z");
  });
  test("a report at 23:30 is not over before it is read", () => {
    const late = new Date("2030-05-01T19:30:00Z");
    assert.ok(
      Date.parse(railWindow("today", late).validTo) - late.getTime() >=
        3_600_000,
    );
  });
});

describe("railEventDraft", () => {
  const input = railReportInput.parse({
    route: "tbilisi-batumi",
    condition: "cancelled",
    duration: "today",
  });

  test("a cancellation is a severe, trusted, valid event", () => {
    const draft = railEventDraft(input, NOON);
    assert.ok(draft);
    assert.ok(eventDraft.safeParse(draft).success);
    assert.equal(draft.kind, "rail.cancelled");
    assert.equal(draft.severity, "severe");
    assert.equal(draft.confidence, 0.9);
  });

  test("a delay is moderate", () => {
    const draft = railEventDraft({ ...input, condition: "delayed" }, NOON);
    assert.equal(draft?.kind, "rail.delayed");
    assert.equal(draft?.severity, "moderate");
  });

  test("running normally writes no event", () => {
    assert.equal(
      railEventDraft({ ...input, condition: "running" }, NOON),
      null,
    );
  });

  test("one key per route, kind and window bucket", () => {
    assert.equal(
      railDedupeKey(
        "rail.cancelled",
        "tbilisi-batumi",
        "2030-05-01T08:00:00.000Z",
      ),
      "rail-report|rail.cancelled|tbilisi-batumi|2030-05-01T06:00:00.000Z",
    );
  });
});

describe("the routes", () => {
  test("every line starts at Tbilisi and has coordinates inside Georgia", () => {
    for (const route of railRoutes) {
      assert.equal(route.stations[0].name, "Tbilisi", route.slug);
      for (const {
        lonLat: [lon, lat],
      } of route.stations) {
        assert.ok(lon > 40 && lon < 47 && lat > 41 && lat < 44, route.slug);
      }
    }
  });

  test("a line becomes WKT in lon lat order", () => {
    assert.match(
      routeLineWkt("tbilisi-kutaisi") ?? "",
      /^LINESTRING\(44\.8023 41\.7226, /,
    );
    assert.equal(routeLineWkt("nope"), null);
  });

  test("a report is described in one line", () => {
    assert.equal(
      describeRail({
        route: "tbilisi-kutaisi",
        condition: "delayed",
        duration: "tomorrow",
      }),
      "Tbilisi – Kutaisi — trains delayed, through tomorrow",
    );
  });
});
