import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { eventDraft } from "./event.ts";
import {
  checkReportDate,
  confidenceFor,
  dayWindow,
  decide,
  hoursDedupeKey,
  hoursEventDraft,
} from "./hours.ts";

describe("checkReportDate", () => {
  test("today and the week ahead are reportable", () => {
    assert.equal(checkReportDate("2030-05-01", "2030-05-01"), null);
    assert.equal(checkReportDate("2030-05-08", "2030-05-01"), null);
  });
  test("the past, the far future and nonsense are not", () => {
    assert.equal(checkReportDate("2030-04-30", "2030-05-01"), "past");
    assert.equal(checkReportDate("2030-05-09", "2030-05-01"), "too-far-ahead");
    assert.equal(checkReportDate("2030-13-45", "2030-05-01"), "invalid");
  });
});

describe("decide", () => {
  test("a curator publishes alone", () => {
    assert.equal(decide("curator", 1), "publish");
  });
  test("a traveller waits for a second", () => {
    assert.equal(decide("community", 1), "wait");
    assert.equal(decide("community", 2), "publish");
  });
});

describe("the event", () => {
  const draft = hoursEventDraft({
    placeId: "00000000-0000-4000-8000-000000000001",
    placeName: "Cafe 5047m",
    date: "2030-05-04",
    trust: "community",
    reporters: 2,
    reportedAt: "2030-05-04T08:00:00.000Z",
  });

  test("covers the Tbilisi day, midnight to midnight", () => {
    assert.deepEqual(dayWindow("2030-05-04"), {
      validFrom: "2030-05-03T20:00:00.000Z",
      validTo: "2030-05-04T20:00:00.000Z",
    });
    assert.equal(draft.validFrom, "2030-05-03T20:00:00.000Z");
  });

  test("is a valid event, trusted by who vouched", () => {
    assert.ok(eventDraft.safeParse(draft).success);
    assert.equal(draft.confidence, confidenceFor("community"));
    assert.ok(confidenceFor("curator") > confidenceFor("community"));
  });

  test("one key per place per day", () => {
    assert.equal(
      hoursDedupeKey("p1", "2030-05-04"),
      "hours-report|hours.closed|p1|2030-05-04",
    );
  });
});
