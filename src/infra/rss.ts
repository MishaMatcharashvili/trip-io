import { XMLParser } from "fast-xml-parser";
import type { FeedItem } from "../domain/watch/feed.ts";

// An RSS 2.0 (or Atom) feed to the items the sense loop stores. The only file
// that knows what an outlet's XML looks like; the domain sees `FeedItem`.

/** Identifies us to the outlet, with somewhere to complain. */
const USER_AGENT = "trip-io-watch/1.0 (+news reader for travel alerts)";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // OC Media wraps titles in CDATA inside CDATA; leave the text raw and let
  // htmlToText unwrap it.
  cdataPropName: false,
  processEntities: true,
  trimValues: true,
});

const text = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return text(o["#text"] ?? o["__cdata"] ?? "");
  }
  return "";
};

const asArray = <T>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const instant = (v: unknown): string | null => {
  const raw = text(v);
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/** Pure: the XML text of a feed to its items. Items with no link are dropped. */
export function parseFeed(xml: string): FeedItem[] {
  const doc = parser.parse(xml) as Record<string, any>;
  const rssItems = asArray<any>(doc.rss?.channel?.item);
  if (rssItems.length > 0) {
    return rssItems.flatMap((i) => {
      const url = text(i.link).trim() || text(i.guid).trim();
      if (!url.startsWith("http")) return [];
      return [
        {
          url,
          title: text(i.title),
          // The full article when the feed has it, the summary when it doesn't.
          body: text(i["content:encoded"]) || text(i.description),
          publishedAt: instant(i.pubDate),
        },
      ];
    });
  }
  return asArray<any>(doc.feed?.entry).flatMap((e) => {
    const link = asArray<any>(e.link).find((l) => l["@_rel"] !== "self");
    const url = text(link?.["@_href"]).trim();
    if (!url.startsWith("http")) return [];
    return [
      {
        url,
        title: text(e.title),
        body: text(e.content) || text(e.summary),
        publishedAt: instant(e.published ?? e.updated),
      },
    ];
  });
}

/** Fetch and parse. A feed that errors throws; the caller reports and goes on. */
export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return parseFeed(await response.text());
}
