import {
  type Alternative,
  couple,
  type EvalFixture,
  family,
  fixture,
  NOW,
  solo,
} from "./fixtures.ts";

// Phase 8's detectors, as fixtures: events and closures from the news, a
// demonstration announced for a time and place, a place reported shut, and a
// cancelled train. The first thirty (fixtures.ts) are weather and roads; the
// judge prompt gained a section for each of these four, and nothing measured
// whether the section worked until this file.
//
// Eleven, not thirty, and written by the engineer who built the detectors
// rather than a second reader — so the "ambiguous" band is small on purpose and
// the quiet band is the larger one. The failure that matters here is the one
// the briefing-only gate exists for: a confident, alarming sentence about a
// protest, or a closure announced for the whole of Tbilisi that the judge
// attaches to every stop in it.
//
// Each news payload is what the detector actually writes
// (`toEventDraft`, `hoursEventDraft`, `railEventDraft`): the same keys.

const at = (h: number) =>
  new Date(Date.parse(NOW) + h * 3_600_000).toISOString();

const news = (
  kind: "event.closure" | "event.festival",
  place: string,
  summary: string,
  quote: string,
) => ({
  what: kind,
  place,
  summary,
  quote,
  language: "ka",
  reportedAt: at(-2),
  outlets: [
    { id: "civil-ge", url: "https://civil.ge/x", quote },
    { id: "jam-news", url: "https://jam-news.net/x", quote },
  ],
});

const safety = (summary: string, quote: string) => ({
  what: "safety.demonstration",
  place: "Tbilisi",
  summary,
  quote,
  language: "en",
  reportedAt: at(-2),
  outlets: [
    { id: "civil-ge", url: "https://civil.ge/y", quote },
    { id: "on-ge", url: "https://on.ge/y", quote },
  ],
});

const cafes: Alternative[] = [
  { name: "Stamba Hotel Cafe", category: "cafe", indoor: true, distanceM: 600 },
  { name: "Cafe Leila", category: "restaurant", indoor: true, distanceM: 400 },
];

export const newsFixtures: EvalFixture[] = [
  // ─── Should fire ───────────────────────────────────────────────────────────
  fixture(
    NOW,
    {
      kind: "event.closure",
      severity: "moderate",
      from: 4,
      to: 12,
      peak: 0,
      source: "news-events",
      payload: news(
        "event.closure",
        "Tbilisi",
        "Rustaveli Avenue is closed to traffic for the Tbilisoba parade.",
        "Rustaveli Avenue will be closed to traffic on Saturday from 14:00 to 22:00",
      ),
    },
    {
      what: "Taxi from Freedom Square to the Mtatsminda funicular along Rustaveli Avenue",
      kind: "transfer",
      at: 5,
      durationMin: 25,
      indoor: false,
    },
    { party: couple, pace: "moderate" },
    [],
    {
      band: "fire",
      relevant: true,
      impact: ["degrades", "blocks"],
      why: "A drive down the very avenue that is closed to traffic, inside the closure window. The cheapest correct answer is to shift it or go another way; staying quiet would send the traveller into a closed street.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "hours.closed",
      severity: "moderate",
      from: -2,
      to: 14,
      peak: 0,
      confidence: 0.8,
      source: "hours-report",
      payload: {
        what: "hours.closed",
        place: "Cafe Leila",
        summary: "Cafe Leila is reported closed on 2026-07-15.",
        reporters: 2,
        vouchedBy: "community",
        reportedAt: at(-1),
      },
    },
    {
      what: "Lunch · Cafe Leila",
      kind: "meal",
      at: 2,
      durationMin: 75,
      indoor: true,
    },
    { party: couple, pace: "moderate", prefs: { interests: ["food"] } },
    [
      {
        name: "Stamba Hotel Cafe",
        category: "cafe",
        indoor: true,
        distanceM: 600,
      },
      {
        name: "Shavi Lomi",
        category: "restaurant",
        indoor: true,
        distanceM: 900,
      },
    ],
    {
      band: "fire",
      relevant: true,
      impact: ["blocks"],
      why: "Two travellers there say the place is shut today, and the stop is lunch at that place. It cannot happen as planned; the useful move is a swap to somewhere open nearby.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "rail.cancelled",
      severity: "severe",
      from: 0,
      to: 14,
      peak: 0,
      confidence: 0.9,
      source: "rail-report",
      payload: {
        what: "rail.cancelled",
        route: "tbilisi-batumi",
        routeName: "Tbilisi – Batumi",
        summary: "Tbilisi – Batumi: trains cancelled",
        reportedAt: at(-1),
      },
    },
    {
      what: "Train Tbilisi to Batumi",
      kind: "transfer",
      at: 2,
      durationMin: 300,
      indoor: true,
    },
    { party: family, pace: "relaxed" },
    [],
    {
      band: "fire",
      relevant: true,
      impact: ["blocks"],
      why: "The stop is the train, and the whole line is reported cancelled for the day. Nothing else in the day can fix a train that is not running; the move is another way to the coast.",
    },
  ),

  // ─── Should stay quiet ─────────────────────────────────────────────────────
  fixture(
    NOW,
    {
      kind: "event.closure",
      severity: "moderate",
      from: 4,
      to: 12,
      peak: 0,
      source: "news-events",
      payload: news(
        "event.closure",
        "Tbilisi",
        "Rustaveli Avenue is closed to traffic for the Tbilisoba parade.",
        "Rustaveli Avenue will be closed to traffic on Saturday from 14:00 to 22:00",
      ),
    },
    {
      what: "Dinner at Fabrika, across the river in Marjanishvili",
      kind: "meal",
      at: 8,
      durationMin: 90,
      indoor: true,
    },
    { party: couple, pace: "moderate" },
    cafes,
    {
      band: "quiet",
      relevant: false,
      why: "The article names one avenue; the stop is dinner on the other side of the river. The matcher pairs them because both are in Tbilisi, which is the known limit of a city-sized geometry, and the judge's job is to say it does not touch this stop.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "hours.closed",
      severity: "moderate",
      from: -2,
      to: 14,
      peak: 0,
      confidence: 0.6,
      source: "hours-report",
      payload: {
        what: "hours.closed",
        place: "Shavi Lomi",
        summary: "Shavi Lomi is reported closed on 2026-07-15.",
        reporters: 2,
        vouchedBy: "community",
        reportedAt: at(-1),
      },
    },
    {
      what: "Coffee at Stamba Hotel Cafe",
      kind: "meal",
      at: 3,
      durationMin: 45,
      indoor: true,
    },
    { party: solo, pace: "moderate" },
    cafes,
    {
      band: "quiet",
      relevant: false,
      why: "Another place on the same block is shut; this one is not. The 150 m the matcher adds is for an entrance round the corner, not for the neighbours, so the judge has to read the place name in the payload.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "safety.demonstration",
      severity: "minor",
      from: 20,
      to: 23,
      peak: 0,
      confidence: 0.5,
      source: "news-safety",
      payload: safety(
        "A demonstration is announced outside parliament on Rustaveli Avenue.",
        "A demonstration is planned outside parliament on Rustaveli Avenue at 18:00",
      ),
    },
    {
      what: "Dinner at a restaurant in Vake",
      kind: "meal",
      at: 21,
      durationMin: 90,
      indoor: true,
    },
    { party: couple, pace: "moderate" },
    cafes,
    {
      band: "quiet",
      relevant: false,
      why: "A demonstration on one avenue in the evening; dinner is in a different district the same hour. Saying anything would be the alarming sentence about a protest this detector is gated to keep from travellers.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "rail.delayed",
      severity: "moderate",
      from: 0,
      to: 14,
      peak: 0,
      confidence: 0.9,
      source: "rail-report",
      payload: {
        what: "rail.delayed",
        route: "tbilisi-kutaisi",
        routeName: "Tbilisi – Kutaisi",
        summary: "Tbilisi – Kutaisi: trains delayed",
        reportedAt: at(-1),
      },
    },
    {
      what: "Drive to Kutaisi in the rental car",
      kind: "transfer",
      at: 2,
      durationMin: 220,
      indoor: false,
      corridorSlug: "east-west-highway",
    },
    { party: family, pace: "relaxed" },
    [],
    {
      band: "quiet",
      relevant: false,
      why: "Trains on the line are late; the traveller is driving their own car. The matcher cannot tell, because a transfer has no mode, and this is the case the briefing must not turn into a worry.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "event.festival",
      severity: "minor",
      from: 2,
      to: 12,
      peak: 0,
      source: "news-events",
      payload: news(
        "event.festival",
        "Tbilisi",
        "An open-air wine festival runs on Vera Park through the day.",
        "An open-air wine festival will take place in Vera Park from noon",
      ),
    },
    {
      what: "Visit the Museum of Fine Arts",
      at: 3,
      durationMin: 120,
      indoor: true,
    },
    { party: couple, pace: "moderate", prefs: { interests: ["history"] } },
    [],
    {
      band: "quiet",
      relevant: false,
      why: "A festival in a park on the other side of the city does nothing to a museum visit; saying so would be noise the traveller never asked for.",
    },
  ),

  // ─── Arguable ──────────────────────────────────────────────────────────────
  fixture(
    NOW,
    {
      kind: "event.festival",
      severity: "minor",
      from: 4,
      to: 14,
      peak: 0,
      source: "news-events",
      payload: news(
        "event.festival",
        "Telavi",
        "A harvest wine festival is held in Telavi's central square.",
        "The harvest wine festival will be held in Telavi's central square on Saturday",
      ),
    },
    {
      what: "Free afternoon in Telavi",
      at: 5,
      durationMin: 240,
      indoor: false,
    },
    { party: couple, pace: "relaxed", prefs: { interests: ["wine"] } },
    [],
    {
      band: "ambiguous",
      why: "A wine festival in the town on the afternoon the traveller has free, and they like wine: the one case where an event is good news. A fine answer is 'improves' with a nudge to go; a fine answer is also silence, because nobody asked for it. What is not fine is any alarm framing.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "safety.demonstration",
      severity: "minor",
      from: 4,
      to: 7,
      peak: 0,
      confidence: 0.5,
      source: "news-safety",
      payload: safety(
        "A demonstration is announced outside parliament on Rustaveli Avenue.",
        "A demonstration is planned outside parliament on Rustaveli Avenue at 18:00",
      ),
    },
    {
      what: "Evening walk along Rustaveli Avenue",
      at: 5,
      durationMin: 90,
      indoor: false,
    },
    { party: couple, pace: "relaxed" },
    [],
    {
      band: "ambiguous",
      why: "The schedule does touch the stop: the same avenue in the same hours. Saying what is announced, without a verdict on the place, is defensible; so is a one-line note in the briefing. Calling the avenue unsafe, or advising against the walk, is not, and is what the scorer's alarm words are for.",
    },
  ),
  fixture(
    NOW,
    {
      kind: "rail.delayed",
      severity: "moderate",
      from: 0,
      to: 14,
      peak: 0,
      confidence: 0.9,
      source: "rail-report",
      payload: {
        what: "rail.delayed",
        route: "tbilisi-borjomi",
        routeName: "Tbilisi – Borjomi",
        summary: "Tbilisi – Borjomi: trains delayed",
        reportedAt: at(-1),
      },
    },
    {
      what: "Transfer Tbilisi to Borjomi",
      kind: "transfer",
      at: 3,
      durationMin: 180,
      indoor: true,
    },
    { party: solo, pace: "moderate" },
    [],
    {
      band: "ambiguous",
      why: "The stop does not say whether it is the train or a marshrutka, and indoor suggests either. If it is the train it is worth a line; if not it is noise. Either verdict is defensible; the evidence line must say the line is checked by hand weekly.",
    },
  ),
];
