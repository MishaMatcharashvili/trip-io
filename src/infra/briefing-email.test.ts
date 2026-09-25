import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type Briefing, quietBriefing } from "../domain/watch/briefing.ts";
import {
  renderBriefingEmail,
  renderText,
  subjectFor,
} from "./briefing-email.ts";

// An email is the one surface nobody can patch after it has been sent, so the
// tests here are about what must never leave the building: an unescaped string,
// a claim with no evidence under it, or a subject line that says nothing.

const links = {
  briefing: "https://trip.io/trips/t1/briefing",
  settings: "https://trip.io/trips/t1/watch",
  pixel: "https://trip.io/api/briefings/b1/opened.gif",
};

const briefing = (over: Partial<Briefing> = {}): Briefing => ({
  tripId: "t1",
  day: {
    date: "2026-10-04",
    index: 3,
    stops: [
      {
        id: "n1",
        title: "Gergeti Trinity hike",
        startsAt: "2026-10-04T07:30:00Z",
        durationMin: 180,
        indoor: false,
      },
    ],
  },
  quiet: false,
  greeting: "Dry until mid-afternoon, and one thing worth moving.",
  lines: [
    {
      matchIds: ["m1"],
      kind: "Weather",
      tone: "alert",
      title: "Rain from 16:00",
      detail: "12 mm, easing by 19:00",
      evidence: ["open-meteo, taken 2026-10-04 06:00"],
    },
  ],
  change: null,
  matchIds: ["m1"],
  sources: 1,
  composedAt: "2026-10-04T03:30:00Z",
  ...over,
});

describe("subjectFor", () => {
  test("is the news, not a label", () => {
    assert.equal(subjectFor(briefing()), "Day 3 · Rain from 16:00");
  });

  test("says so when there is nothing to say", () => {
    const quiet = quietBriefing({
      tripId: "t1",
      day: briefing().day,
      now: new Date("2026-10-04T03:30:00Z"),
    });
    assert.equal(subjectFor(quiet), "Day 3 · all clear");
  });

  test("never says all clear while the judge still owes a verdict", () => {
    const unchecked = quietBriefing({
      tripId: "t1",
      day: briefing().day,
      now: new Date("2026-10-04T03:30:00Z"),
      unresolved: 1,
    });
    assert.doesNotMatch(subjectFor(unchecked), /all clear/);
  });

  test("truncates rather than overflowing the client's preview", () => {
    const long = "R".repeat(200);
    const subject = subjectFor(
      briefing({ lines: [{ ...briefing().lines[0], title: long }] }),
    );
    assert.ok(subject.length < 70, subject);
    assert.ok(subject.endsWith("…"));
  });
});

describe("renderBriefingEmail", () => {
  test("escapes what the model wrote", () => {
    const html = renderBriefingEmail(
      briefing({ greeting: '<script>alert("x")</script> & rain' }),
      links,
    ).html;
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("&amp; rain"));
  });

  test("carries the evidence beside the claim", () => {
    const html = renderBriefingEmail(briefing(), links).html;
    assert.ok(html.includes("open-meteo, taken 2026-10-04 06:00"));
  });

  test("says a change is not applied until it is accepted", () => {
    const html = renderBriefingEmail(
      briefing({
        change: {
          matchId: "m1",
          eventId: "e1",
          nodeId: "n1",
          sentence: "Move the hike to 11:30 and the museum to the afternoon.",
          evidence: "open-meteo, taken 2026-10-04 06:00",
          proposals: [],
        },
      }),
      links,
    ).html;
    assert.ok(html.includes("Nothing is applied until you accept it."));
    assert.ok(html.includes("1 change recommended"));
  });

  test("omits the change block entirely when there is none", () => {
    const html = renderBriefingEmail(briefing(), links).html;
    assert.ok(!html.includes("1 change recommended"));
  });

  test("includes the open pixel only when it is given one", () => {
    assert.ok(
      renderBriefingEmail(briefing(), links).html.includes(links.pixel),
    );
    const { pixel: _, ...noPixel } = links;
    assert.ok(!renderBriefingEmail(briefing(), noPixel).html.includes("<img"));
  });

  test("states the coverage it actually has", () => {
    assert.ok(renderBriefingEmail(briefing(), links).html.includes("1 source"));
    assert.ok(
      renderBriefingEmail(briefing({ sources: 4 }), links).html.includes(
        "4 sources",
      ),
    );
  });
});

describe("renderText", () => {
  test("is a whole briefing, not a link to one", () => {
    const text = renderText(briefing(), links);
    assert.ok(text.includes("Rain from 16:00"));
    assert.ok(text.includes("12 mm, easing by 19:00"));
    assert.ok(text.includes("open-meteo, taken 2026-10-04 06:00"));
    assert.ok(text.includes("Gergeti Trinity hike"));
    assert.ok(text.includes(links.briefing));
  });

  test("tells the day in Tbilisi time, whatever the server runs on", () => {
    // 07:30Z is 11:30 in Tbilisi, and the traveller is in Tbilisi.
    assert.ok(renderText(briefing(), links).includes("11:30"));
  });
});
