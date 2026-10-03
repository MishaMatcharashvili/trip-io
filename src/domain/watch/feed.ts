// A feed item as the sense loop stores it: plain text, bounded, with a hash.
// What an outlet puts in an RSS item is HTML, sometimes CDATA inside CDATA,
// sometimes ten kilobytes of related-article links.

/** One item, already parsed out of the XML. */
export type FeedItem = {
  url: string;
  title: string;
  /** HTML, as the feed sent it. */
  body: string;
  publishedAt: string | null;
};

/**
 * Enough for a lede, a date and a place. A feed's `description` is a summary and
 * `content:encoded` an article; past the first few thousand characters it is
 * comments and related links, and the model is billed by the character.
 */
export const MAX_ITEM_CHARS = 4_000;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

const decode = (s: string): string =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code =
        name[1].toLowerCase() === "x"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000
        ? String.fromCodePoint(code)
        : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });

/** HTML to the words a person would read, paragraphs kept as line breaks. */
export function htmlToText(html: string): string {
  return decode(
    html
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The text stored for an item: title, then body, bounded. The title leads
 * because it is the one part every feed has and the part a quote most often
 * comes from.
 */
export function itemText(item: FeedItem): string {
  const title = htmlToText(item.title);
  const body = htmlToText(item.body);
  const whole = body.startsWith(title) ? body : `${title}\n\n${body}`;
  return whole.length > MAX_ITEM_CHARS
    ? `${whole.slice(0, MAX_ITEM_CHARS).trimEnd()}…`
    : whole;
}
