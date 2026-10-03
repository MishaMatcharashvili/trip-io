import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { eventDraft as eventDraftSchema } from "./event.ts";
import {
  CAPS,
  normalizeForQuote,
  quoteIsInSource,
  SAFETY_SOURCE,
  toEventDraft,
  vetExtraction,
} from "./extraction.ts";

const NOW = new Date("2030-05-01T08:00:00Z");

const TEXT =
  "Tbilisi City Hall said Rustaveli Avenue will be closed to traffic on Saturday " +
  "from 14:00 to 22:00 for the Tbilisoba parade. Buses will be rerouted.";

const QUOTE = "Rustaveli Avenue will be closed to traffic on Saturday";

const item = (over: Record<string, unknown> = {}) => ({
  kind: "event.closure",
  place: "Tbilisi",
  startsAt: "2030-05-04T10:00:00Z",
  endsAt: "2030-05-04T18:00:00Z",
  summary: "Rustaveli Avenue is closed to traffic for the Tbilisoba parade.",
  quote: QUOTE,
  confidence: 0.95,
  ...over,
});

const ctx = (over = {}) => ({
  text: TEXT,
  detector: "events" as const,
  now: NOW,
  resolveRegion: (place: string) => (place === "Tbilisi" ? "tbilisi" : null),
  ...over,
});

const reasons = (raw: unknown, c = ctx()) =>
  vetExtraction(raw, c).rejected.map((r) => r.reason);

describe("vetExtraction", () => {
  test("accepts a quoted, placed, bounded claim and caps its confidence", () => {
    const result = vetExtraction({ items: [item()] }, ctx());
    assert.equal(result.rejected.length, 0);
    assert.equal(result.accepted.length, 1);
    assert.equal(result.accepted[0].regionSlug, "tbilisi");
    assert.equal(
      result.accepted[0].confidence,
      CAPS["event.closure"].confidence,
    );
    assert.equal(result.accepted[0].severity, "moderate");
  });

  test("a model unsure of itself is not raised to the cap", () => {
    const result = vetExtraction({ items: [item({ confidence: 0.3 })] }, ctx());
    assert.equal(result.accepted[0].confidence, 0.3);
  });

  test("malformed output is a rejection, not an exception", () => {
    assert.deepEqual(reasons("nonsense"), ["malformed"]);
    assert.deepEqual(reasons({ items: [item({ kind: "event.riot" })] }), [
      "malformed",
    ]);
  });

  test("a quote the article does not contain is refused", () => {
    assert.deepEqual(
      reasons({
        items: [item({ quote: "The mayor cancelled the parade entirely" })],
      }),
      ["quote-not-in-source"],
    );
  });

  test("a place that is in no sense region is refused, not guessed", () => {
    assert.deepEqual(reasons({ items: [item({ place: "Narnia" })] }), [
      "unknown-place",
    ]);
  });

  test("windows: backwards, past, too far ahead, too long", () => {
    assert.deepEqual(
      reasons({
        items: [
          item({
            startsAt: "2030-05-04T18:00:00Z",
            endsAt: "2030-05-04T10:00:00Z",
          }),
        ],
      }),
      ["window-backwards"],
    );
    assert.deepEqual(
      reasons({
        items: [
          item({
            startsAt: "2030-04-30T10:00:00Z",
            endsAt: "2030-04-30T18:00:00Z",
          }),
        ],
      }),
      ["window-in-the-past"],
    );
    assert.deepEqual(
      reasons({
        items: [
          item({
            startsAt: "2030-06-04T10:00:00Z",
            endsAt: "2030-06-04T18:00:00Z",
          }),
        ],
      }),
      ["window-too-far-ahead"],
    );
    assert.deepEqual(
      reasons({
        items: [
          item({
            startsAt: "2030-05-02T10:00:00Z",
            endsAt: "2030-05-09T10:00:00Z",
          }),
        ],
      }),
      ["window-too-long"],
    );
  });

  test("an event already under way is not in the past", () => {
    const result = vetExtraction(
      {
        items: [
          item({
            startsAt: "2030-05-01T06:00:00Z",
            endsAt: "2030-05-01T12:00:00Z",
          }),
        ],
      },
      ctx(),
    );
    assert.equal(result.accepted.length, 1);
  });

  test("a safety kind from the events detector is refused", () => {
    assert.deepEqual(
      reasons({ items: [item({ kind: "safety.demonstration" })] }),
      ["wrong-detector"],
    );
  });

  test("safety is held to a day and to lower confidence", () => {
    const text = `${TEXT} A demonstration is planned outside parliament.`;
    const safety = item({
      kind: "safety.demonstration",
      quote: "A demonstration is planned outside parliament",
      startsAt: "2030-05-02T10:00:00Z",
      endsAt: "2030-05-02T18:00:00Z",
    });
    const result = vetExtraction(
      { items: [safety] },
      ctx({ text, detector: "safety" }),
    );
    assert.equal(result.accepted[0].confidence, 0.5);
    assert.deepEqual(
      reasons(
        { items: [{ ...safety, endsAt: "2030-05-04T10:00:00Z" }] },
        ctx({ text, detector: "safety" }),
      ),
      ["window-too-long"],
    );
  });

  test("one bad item does not cost the good one", () => {
    const result = vetExtraction(
      { items: [item({ place: "Narnia" }), item()] },
      ctx(),
    );
    assert.equal(result.accepted.length, 1);
    assert.equal(result.rejected.length, 1);
  });
});

describe("quoteIsInSource", () => {
  test("tolerates case, spacing and typographic quotes — not different words", () => {
    assert.ok(quoteIsInSource("rustaveli  avenue\nwill be closed", TEXT));
    assert.ok(quoteIsInSource("it’s closed", "It's closed today"));
    assert.ok(!quoteIsInSource("Rustaveli Avenue will stay open", TEXT));
  });

  test("an ellipsis the model added at either end is not part of the quote", () => {
    assert.ok(quoteIsInSource("... avenue will be closed to traffic …", TEXT));
    assert.ok(!quoteIsInSource("...", TEXT));
  });

  test("normalisation is idempotent", () => {
    const once = normalizeForQuote("  A—B   “C” ");
    assert.equal(normalizeForQuote(once), once);
  });
});

describe("eventDraft", () => {
  test("carries what the judge may cite, and validates as an event", () => {
    const [vetted] = vetExtraction({ items: [item()] }, ctx()).accepted;
    const draft = toEventDraft(vetted, {
      source: "interpressnews",
      url: "https://example.ge/a",
      language: "ka",
      observedAt: NOW.toISOString(),
    });
    assert.ok(eventDraftSchema.safeParse(draft).success);
    assert.equal(draft.kind, "event.closure");
    assert.equal(draft.payload.quote, QUOTE);
    assert.equal(draft.payload.language, "ka");
    assert.equal(draft.validFrom, "2030-05-04T10:00:00.000Z");
  });
});

describe("safety claims", () => {
  const SAFE_TEXT =
    "A demonstration is planned outside parliament on Rustaveli Avenue tomorrow at 18:00 and the area is dangerous.";
  const safety = (over: Record<string, unknown> = {}) => ({
    kind: "safety.demonstration",
    place: "Tbilisi",
    startsAt: "2030-05-02T14:00:00Z",
    endsAt: "2030-05-02T18:00:00Z",
    summary:
      "A demonstration is planned outside parliament on Rustaveli Avenue.",
    quote: "A demonstration is planned outside parliament on Rustaveli Avenue",
    confidence: 0.9,
    ...over,
  });
  const c = ctx({ text: SAFE_TEXT, detector: "safety" as const });

  test("a scheduled demonstration is described, not characterised", () => {
    assert.equal(vetExtraction({ items: [safety()] }, c).accepted.length, 1);
  });

  test("a summary that judges the place is refused", () => {
    assert.deepEqual(
      reasons(
        {
          items: [
            safety({ summary: "The area around parliament is dangerous." }),
          ],
        },
        c,
      ),
      ["characterises"],
    );
    assert.deepEqual(
      reasons(
        {
          items: [
            safety({ summary: "Tourists should avoid Rustaveli Avenue." }),
          ],
        },
        c,
      ),
      ["characterises"],
    );
  });

  test("the same wording is fine for an event, which is not judged", () => {
    const festival = item({ summary: "Roads are chaotic during the parade." });
    assert.equal(
      vetExtraction({ items: [festival] }, ctx()).accepted.length,
      1,
    );
  });

  test("a safety draft names its outlet in a list other outlets can join", () => {
    const [vetted] = vetExtraction({ items: [safety()] }, c).accepted;
    const draft = toEventDraft(vetted, {
      source: "civil-ge",
      url: "https://civil.ge/x",
      language: "en",
      observedAt: NOW.toISOString(),
    });
    assert.equal(draft.source, SAFETY_SOURCE);
    assert.deepEqual(draft.payload.outlets, [
      {
        id: "civil-ge",
        url: "https://civil.ge/x",
        quote:
          "A demonstration is planned outside parliament on Rustaveli Avenue",
      },
    ]);
  });

  test("an event draft keeps its outlet as its source and has no outlet list", () => {
    const [vetted] = vetExtraction({ items: [item()] }, ctx()).accepted;
    const draft = toEventDraft(vetted, {
      source: "civil-ge",
      url: "u",
      language: "en",
      observedAt: NOW.toISOString(),
    });
    assert.equal(draft.source, "civil-ge");
    assert.equal(draft.payload.outlets, undefined);
  });
});
