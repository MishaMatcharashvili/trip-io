import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { Extractor, Translator } from "./extraction.ts";
import { type ReadPorts, readItem, type StoredItem } from "./read-item.ts";

const NOW = new Date("2030-05-01T08:00:00Z");
const ENGLISH =
  "Rustaveli Avenue will be closed to traffic on Saturday from 14:00 to 22:00 for the parade.";
const QUOTE = "Rustaveli Avenue will be closed to traffic on Saturday";

const claim = {
  kind: "event.closure",
  place: "Tbilisi",
  startsAt: "2030-05-04T10:00:00Z",
  endsAt: "2030-05-04T18:00:00Z",
  summary: "Rustaveli Avenue is closed for the parade.",
  quote: QUOTE,
  confidence: 0.9,
};

function ports(
  over: Partial<ReadPorts> & { calls?: string[] } = {},
): ReadPorts {
  const calls = over.calls ?? [];
  const translate: Translator = async (text) => {
    calls.push("translate");
    return { language: "ka", english: `${ENGLISH}` + (text ? "" : "") };
  };
  const extract: Extractor = async () => {
    calls.push("extract");
    return { items: [claim] };
  };
  return {
    translate,
    extract,
    resolveRegion: (p) => (p === "Tbilisi" ? "tbilisi" : null),
    now: () => NOW,
    ...over,
  };
}

const item = (over: Partial<StoredItem> = {}): StoredItem => ({
  source: "on-ge",
  url: "https://on.ge/1",
  language: "ka",
  originalText: "რუსთაველის გამზირი დაიკეტება",
  text: null,
  publishedAt: null,
  ...over,
});

describe("readItem", () => {
  test("a Georgian item is translated, extracted, vetted and published", async () => {
    const calls: string[] = [];
    const out = await readItem(item(), ["events"], ports({ calls }));
    assert.deepEqual(calls, ["translate", "extract"]);
    assert.equal(out.status, "published");
    assert.equal(out.events[0].regionSlug, "tbilisi");
    assert.equal(out.events[0].draft.payload.language, "ka");
    assert.equal(out.english, ENGLISH);
  });

  test("an English item is not translated", async () => {
    const calls: string[] = [];
    await readItem(
      item({ language: "en", originalText: ENGLISH }),
      ["events"],
      ports({ calls }),
    );
    assert.deepEqual(calls, ["extract"]);
  });

  test("a translation kept from an earlier attempt is not paid for twice", async () => {
    const calls: string[] = [];
    await readItem(item({ text: ENGLISH }), ["events"], ports({ calls }));
    assert.deepEqual(calls, ["extract"]);
  });

  test("an item the gate stops never reaches the model", async () => {
    const calls: string[] = [];
    const out = await readItem(
      item({
        language: "en",
        originalText: "Parliament adopted the law on Tuesday.",
      }),
      ["events"],
      ports({ calls }),
    );
    assert.deepEqual(calls, []);
    assert.equal(out.status, "empty");
    assert.equal(out.reason, "not-relevant");
  });

  test("a claim the guards refuse is rejected, with the reason and the model's answer kept", async () => {
    const out = await readItem(
      item({ language: "en", originalText: ENGLISH }),
      ["events"],
      ports({
        extract: async () => ({
          items: [{ ...claim, quote: "The mayor resigned yesterday" }],
        }),
      }),
    );
    assert.equal(out.status, "rejected");
    assert.equal(out.reason, "quote-not-in-source");
    assert.equal(out.events.length, 0);
    assert.equal(out.extraction.length, 1);
  });

  test("a model that finds nothing is empty, not rejected", async () => {
    const out = await readItem(
      item({ language: "en", originalText: ENGLISH }),
      ["events"],
      ports({ extract: async () => ({ items: [] }) }),
    );
    assert.equal(out.status, "empty");
    assert.equal(out.reason, "nothing-found");
  });

  test("a translator that throws leaves the item for a retry", async () => {
    await assert.rejects(
      readItem(
        item(),
        ["events"],
        ports({
          translate: async () => {
            throw new Error("503");
          },
        }),
      ),
      /503/,
    );
  });
});
