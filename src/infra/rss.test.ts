import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseFeed } from "./rss.ts";

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title><![CDATA[ Parade on Saturday ]]></title><link>https://example.ge/a</link>
<pubDate>Sat, 03 Oct 2026 15:15:51 +0000</pubDate>
<description><![CDATA[<p>Short.</p>]]></description>
<content:encoded><![CDATA[<p>Rustaveli will be closed on Saturday.</p>]]></content:encoded></item>
<item><title>No link</title></item>
<item><title>გამზირი</title><guid>https://example.ge/b</guid><description>Summary only &amp; plain</description></item>
</channel></rss>`;

describe("parseFeed", () => {
  test("reads items, preferring the full article over the summary", () => {
    const items = parseFeed(RSS);
    assert.equal(items.length, 2);
    assert.equal(items[0].url, "https://example.ge/a");
    assert.match(items[0].body, /Rustaveli will be closed/);
    assert.equal(items[0].publishedAt, "2026-10-03T15:15:51.000Z");
  });

  test("falls back to the summary and to the guid for the link", () => {
    const [, second] = parseFeed(RSS);
    assert.equal(second.url, "https://example.ge/b");
    assert.equal(second.body, "Summary only & plain");
    assert.equal(second.publishedAt, null);
  });

  test("reads Atom", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title>
      <link rel="alternate" href="https://example.ge/c"/><updated>2026-10-01T10:00:00Z</updated>
      <summary>S</summary></entry></feed>`;
    const [only] = parseFeed(atom);
    assert.equal(only.url, "https://example.ge/c");
    assert.equal(only.body, "S");
  });

  test("garbage is no items, not a crash", () => {
    assert.deepEqual(parseFeed("<html><body>503</body></html>"), []);
  });
});
