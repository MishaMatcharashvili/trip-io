import { z } from "zod";
import {
  type EventDraft,
  eventListingKinds,
  type Severity,
  safetyKinds,
} from "./event.ts";

// Detectors 3 and 4 read prose, and prose is where a model is most willing to
// be confident and wrong. So the model's job here is small — find the claim and
// quote the sentence it rests on — and every check on whether the claim may
// become an event is deterministic and lives in this file, where it is tested
// without a key. The same split the judge makes: a prompt asks, a guard refuses.
//
// Sources are Georgian as often as English. Everything below the translator
// reads English only: the extractor is shown the translation, the quote guard
// is checked against the translation, and the original is stored beside it for
// a person who needs to check the claim against what was actually printed.

export type Translated = {
  /** BCP 47, as the translator detected it ("ka", "en"). */
  language: string;
  /** English. The input itself when it already was. */
  english: string;
};

/**
 * Text in, English out. Declared here, implemented in src/infra, so the model
 * behind it is a swap in one file. Implementations return the input unchanged
 * for English and must not summarise: the extractor's quote is checked against
 * this text, and a translator that paraphrases would make every quote fail
 * or, worse, pass against words nobody printed.
 */
export type Translator = (text: string) => Promise<Translated>;

/** What the extractor is shown. English only; see above. */
export type ExtractionInput = {
  /** Which detector is asking: it decides which kinds the model may use. */
  detector: "events" | "safety";
  source: string;
  url: string;
  publishedAt: string | null;
  /** Today in Tbilisi, so "tomorrow" and "this Saturday" have an anchor. */
  now: string;
  text: string;
};

/**
 * The model call. Returns whatever the model said — `vetExtraction` is what
 * turns that into something usable, so a bad answer is a recorded rejection,
 * never an exception.
 */
export type Extractor = (input: ExtractionInput) => Promise<unknown>;

const isoInstant = z.iso.datetime({ offset: true });

export const extractableKinds = [...eventListingKinds, ...safetyKinds] as const;
export type ExtractableKind = (typeof extractableKinds)[number];

export const extractedItem = z.object({
  kind: z.enum(extractableKinds),
  /** The place as the article names it: a street, a district, a town. */
  place: z.string().min(1).max(120),
  startsAt: isoInstant,
  endsAt: isoInstant,
  /** One factual sentence. Describes what is scheduled; never characterises. */
  summary: z.string().min(1).max(240),
  /** The sentence the claim rests on, copied exactly from the text. */
  quote: z.string().min(12).max(400),
  confidence: z.number().min(0).max(1),
});
export type ExtractedItem = z.infer<typeof extractedItem>;

export const extraction = z.object({ items: z.array(extractedItem).max(10) });

export const extractionRejections = [
  "malformed",
  "quote-not-in-source",
  "unknown-place",
  "window-backwards",
  "window-in-the-past",
  "window-too-far-ahead",
  "window-too-long",
  "wrong-detector",
] as const;
export type ExtractionRejection = (typeof extractionRejections)[number];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * What each kind is allowed to claim, whatever the model said. The caps are the
 * detector's, not the model's: confidence is what the router's interrupt gate
 * reads, and a number the model chose is not a number to gate on.
 */
export const CAPS: Record<
  ExtractableKind,
  {
    detector: ExtractionInput["detector"];
    confidence: number;
    severity: Severity;
    maxWindowHours: number;
    maxLeadDays: number;
  }
> = {
  "event.festival": {
    detector: "events",
    confidence: 0.7,
    severity: "minor",
    maxWindowHours: 7 * 24,
    maxLeadDays: 14,
  },
  "event.closure": {
    detector: "events",
    confidence: 0.7,
    severity: "moderate",
    maxWindowHours: 3 * 24,
    maxLeadDays: 14,
  },
  // Safety is capped hard: low confidence, never worse than moderate, and a
  // day's window, so a stale article cannot haunt a week.
  "safety.demonstration": {
    detector: "safety",
    confidence: 0.5,
    severity: "minor",
    maxWindowHours: 24,
    maxLeadDays: 3,
  },
  "safety.advisory": {
    detector: "safety",
    confidence: 0.5,
    severity: "moderate",
    maxWindowHours: 24,
    maxLeadDays: 3,
  },
};

/**
 * Case, whitespace and the quote and dash variants a translator or an HTML
 * parser introduces are not the model's invention; the words are.
 */
export const normalizeForQuote = (s: string): string =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚′`]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

/**
 * A model asked for "the exact sentence" will often mark that it took the
 * middle of one with an ellipsis. The ellipsis is its punctuation, not the
 * article's, so it is dropped from the ends before looking.
 */
const trimEllipsis = (s: string): string =>
  s.replace(/^(\.{2,}|…|\s)+|(\.{2,}|…|\s)+$/g, "");

export const quoteIsInSource = (quote: string, text: string): boolean => {
  const needle = normalizeForQuote(trimEllipsis(quote.normalize("NFKC")));
  return needle.length > 0 && normalizeForQuote(text).includes(needle);
};

export type VetContext = {
  /** The English text the extractor was shown. */
  text: string;
  /** The detector that asked: a kind from the other one is refused. */
  detector: ExtractionInput["detector"];
  now: Date;
  /** A sense region's slug for a place the article names, or null. */
  resolveRegion: (place: string) => string | null;
};

export type Vetted = {
  item: ExtractedItem;
  regionSlug: string;
  /** The model's confidence, capped. */
  confidence: number;
  severity: Severity;
};

export type VetResult = {
  accepted: Vetted[];
  rejected: { reason: ExtractionRejection; place?: string; quote?: string }[];
};

/**
 * Every check between a model's answer and an event. A refused item is
 * reported with its reason, the same as a refused verdict: how often each
 * reason fires is the earliest sign a prompt edit went wrong.
 */
export function vetExtraction(raw: unknown, ctx: VetContext): VetResult {
  const parsed = extraction.safeParse(raw);
  if (!parsed.success) {
    return { accepted: [], rejected: [{ reason: "malformed" }] };
  }

  const out: VetResult = { accepted: [], rejected: [] };
  const now = ctx.now.getTime();

  for (const item of parsed.data.items) {
    const refuse = (reason: ExtractionRejection) =>
      out.rejected.push({ reason, place: item.place, quote: item.quote });
    const caps = CAPS[item.kind];

    if (caps.detector !== ctx.detector) {
      refuse("wrong-detector");
      continue;
    }
    if (!quoteIsInSource(item.quote, ctx.text)) {
      refuse("quote-not-in-source");
      continue;
    }
    const regionSlug = ctx.resolveRegion(item.place);
    if (!regionSlug) {
      refuse("unknown-place");
      continue;
    }
    const start = Date.parse(item.startsAt);
    const end = Date.parse(item.endsAt);
    if (!(start < end)) {
      refuse("window-backwards");
      continue;
    }
    if (end <= now) {
      refuse("window-in-the-past");
      continue;
    }
    if (start - now > caps.maxLeadDays * DAY_MS) {
      refuse("window-too-far-ahead");
      continue;
    }
    if (end - start > caps.maxWindowHours * HOUR_MS) {
      refuse("window-too-long");
      continue;
    }

    out.accepted.push({
      item,
      regionSlug,
      confidence: Math.min(item.confidence, caps.confidence),
      severity: caps.severity,
    });
  }
  return out;
}

/**
 * A vetted extraction as the world event it becomes. The payload is everything
 * the judge may cite and nothing it may not: the sentence the claim rests on,
 * where it was printed, and when the page said so.
 */
export function toEventDraft(
  vetted: Vetted,
  from: { source: string; url: string; language: string; observedAt: string },
): EventDraft {
  const { item } = vetted;
  return {
    source: from.source,
    kind: item.kind,
    severity: vetted.severity,
    confidence: vetted.confidence,
    validFrom: new Date(item.startsAt).toISOString(),
    validTo: new Date(item.endsAt).toISOString(),
    payload: {
      what: item.kind,
      place: item.place,
      summary: item.summary,
      quote: item.quote,
      url: from.url,
      language: from.language,
      reportedAt: from.observedAt,
    },
  };
}
