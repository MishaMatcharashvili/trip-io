import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { htmlToText, itemText, MAX_ITEM_CHARS } from "./feed.ts";
import { worthReading } from "./relevance.ts";
import { enabledSources, NEWS_SOURCES } from "./sources.ts";

describe("htmlToText", () => {
  test("strips tags, decodes entities, keeps paragraphs", () => {
    assert.equal(
      htmlToText(
        "<p>Rustaveli &amp; Marjanishvili</p><p>Closed&nbsp;Saturday&#33;</p>",
      ),
      "Rustaveli & Marjanishvili\nClosed Saturday!",
    );
  });

  test("unwraps CDATA, including CDATA inside CDATA", () => {
    assert.equal(htmlToText("<![CDATA[ <![CDATA[ Hello ]]> ]]>"), "Hello");
  });

  test("drops scripts and styles, and survives a bad entity", () => {
    assert.equal(
      htmlToText("a<script>alert(1)</script>b &#99999999; &nosuch;"),
      "a b &#99999999; &nosuch;",
    );
  });
});

describe("itemText", () => {
  test("leads with the title unless the body already does", () => {
    assert.equal(
      itemText({
        url: "u",
        title: "Parade",
        body: "<p>On Saturday.</p>",
        publishedAt: null,
      }),
      "Parade\n\nOn Saturday.",
    );
    assert.equal(
      itemText({
        url: "u",
        title: "Parade",
        body: "<p>Parade on Saturday.</p>",
        publishedAt: null,
      }),
      "Parade on Saturday.",
    );
  });

  test("is bounded", () => {
    const long = itemText({
      url: "u",
      title: "T",
      body: `<p>${"word ".repeat(2_000)}</p>`,
      publishedAt: null,
    });
    assert.ok(long.length <= MAX_ITEM_CHARS + 1);
    assert.ok(long.endsWith("…"));
  });
});

describe("worthReading", () => {
  test("an event with a time passes", () => {
    assert.ok(
      worthReading(
        "events",
        "Rustaveli Avenue will be closed on Saturday from 14:00.",
      ),
    );
  });

  test("politics with no event in it does not", () => {
    assert.ok(
      !worthReading(
        "events",
        "Parliament adopted the law on Tuesday after a long debate.",
      ),
    );
  });

  test("an event word with no time does not", () => {
    assert.ok(
      !worthReading("events", "The festival has a long and storied history."),
    );
  });

  test("safety has its own words", () => {
    assert.ok(
      worthReading(
        "safety",
        "A protest is planned tomorrow at 18:00 outside parliament.",
      ),
    );
    assert.ok(
      !worthReading("events", "A protest is planned outside parliament."),
    );
  });
});

describe("the source list", () => {
  test("ids are unique and urls are https", () => {
    const ids = NEWS_SOURCES.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const s of NEWS_SOURCES) assert.ok(s.url.startsWith("https://"), s.id);
  });

  test("nothing reads for safety until safety has its gate", () => {
    assert.equal(enabledSources("safety").length, 0);
    assert.ok(enabledSources("events").length >= 4);
  });
});
