// Where detectors 3 and 4 read. A list in code rather than a data file: it is
// typed, reviewed like any other change, and a test can hold it to its own
// rules. Each entry was fetched and read on 2026-10-03 before it was written
// down; `note` says what was seen, so the next person can tell a feed that
// went quiet from a feed that was never any good.

export type SourceLanguage = "en" | "ka" | "ru";

export type NewsSource = {
  /** Stable. It is `source_item.source` and what a world event names as its source. */
  id: string;
  name: string;
  kind: "rss";
  url: string;
  language: SourceLanguage;
  /** Which detectors may read it. */
  detectors: readonly ("events" | "safety")[];
  enabled: boolean;
  note: string;
};

export const NEWS_SOURCES: readonly NewsSource[] = [
  {
    id: "civil-ge",
    name: "Civil Georgia",
    kind: "rss",
    url: "https://civil.ge/feed",
    language: "en",
    detectors: ["events", "safety"],
    enabled: true,
    note: "English. 10 items, full text in content:encoded. Politics-heavy: most items are not events, which the gate absorbs.",
  },
  {
    id: "jam-news",
    name: "JAMnews",
    kind: "rss",
    url: "https://jam-news.net/feed/",
    language: "en",
    detectors: ["events", "safety"],
    enabled: true,
    note: "English, South Caucasus. 10 items, full text.",
  },
  {
    id: "oc-media",
    name: "OC Media",
    kind: "rss",
    url: "https://oc-media.org/feed/",
    language: "en",
    detectors: ["events", "safety"],
    enabled: true,
    note: "English, Caucasus. 16 items, full text. Titles arrive wrapped in CDATA inside CDATA.",
  },
  {
    id: "netgazeti",
    name: "Netgazeti",
    kind: "rss",
    url: "https://netgazeti.ge/feed/",
    language: "ka",
    detectors: ["events", "safety"],
    enabled: true,
    note: "Georgian. 32 items, summary only. The feed's declared language is wrong (en-US).",
  },
  {
    id: "on-ge",
    name: "On.ge",
    kind: "rss",
    url: "https://on.ge/rss",
    language: "ka",
    detectors: ["events", "safety"],
    enabled: true,
    note: "Georgian. 50 items, summary only.",
  },
  {
    id: "news-georgia",
    name: "NewsGeorgia",
    kind: "rss",
    url: "https://newsgeorgia.ge/feed/",
    language: "ru",
    detectors: ["events", "safety"],
    enabled: false,
    note: "Russian. 100 items, summary only. Off: Russian-language coverage was not asked for; turn on if the others prove thin.",
  },
];

/**
 * Looked at and not usable as a feed, so nobody checks again without a reason.
 * Not code — the point is the reasons.
 *
 *  - Georgia Today (georgiatoday.ge/feed/): HTTP 500 on every path tried.
 *  - Agenda.ge, InterPressNews: no RSS link in the page; HTML only.
 *  - 1TV, BM.ge, Tbilisi City Hall (tbilisi.gov.ge), georgia.travel: no feed at
 *    the usual paths. georgia.travel/events and yolo.ge/en/posters/festivals
 *    are HTML listings; reading them is an HTML adapter, not an RSS one.
 *  - NEA (nea.gov.ge, meteo.gov.ge): reachable, but the warnings page was not
 *    found at /Ge/Warnings. The forecast comes from Open-Meteo regardless.
 *  - georoad.ge/ka/restriction: the Roads Department's own dated notices, in
 *    Georgian, server-rendered HTML. The road-automation spike's source, not a
 *    news feed (context/phase-8-design.md).
 */
export const enabledNewsSources = (): readonly NewsSource[] =>
  NEWS_SOURCES.filter((s) => s.enabled);

export const enabledSources = (
  detector: "events" | "safety",
): readonly NewsSource[] =>
  NEWS_SOURCES.filter((s) => s.enabled && s.detectors.includes(detector));
