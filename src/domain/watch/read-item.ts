import type { EventDraft } from "./event.ts";
import {
  type ExtractionInput,
  type ExtractionRejection,
  type Extractor,
  type Translator,
  toEventDraft,
  type VetResult,
  vetExtraction,
} from "./extraction.ts";
import { worthReading } from "./relevance.ts";

// One stored item, read: translated, gated, extracted, vetted. Pure over its
// ports, like the trip pipeline — the model, the translator and the gazetteer
// are arguments, so every branch runs against fakes and the bll only has to
// persist what comes back.

export type StoredItem = {
  source: string;
  url: string;
  /** The outlet's language, from the source list. */
  language: string;
  originalText: string;
  /** Already translated by an earlier attempt that failed later. */
  text: string | null;
  publishedAt: string | null;
};

export type ReadPorts = {
  translate: Translator;
  extract: Extractor;
  resolveRegion: (place: string) => string | null;
  now: () => Date;
};

export type ItemOutcome = {
  /** The English the extractor was (or would have been) shown. */
  english: string;
  status: "empty" | "rejected" | "published";
  /** Why it is not `published`. */
  reason: "not-relevant" | "nothing-found" | ExtractionRejection | null;
  /** Everything the model said, kept for audit and for the road spike. */
  extraction: unknown[];
  events: { draft: EventDraft; regionSlug: string }[];
  rejected: VetResult["rejected"];
};

export async function readItem(
  item: StoredItem,
  detectors: readonly ExtractionInput["detector"][],
  ports: ReadPorts,
): Promise<ItemOutcome> {
  const english =
    item.text ??
    (item.language === "en"
      ? item.originalText
      : (await ports.translate(item.originalText)).english);

  const asked = detectors.filter((d) => worthReading(d, english));
  const base = {
    english,
    extraction: [] as unknown[],
    events: [],
    rejected: [],
  };
  if (asked.length === 0) {
    return { ...base, status: "empty", reason: "not-relevant" };
  }

  const observedAt = ports.now().toISOString();
  const outcome: ItemOutcome = {
    ...base,
    status: "empty",
    reason: "nothing-found",
  };

  for (const detector of asked) {
    const raw = await ports.extract({
      detector,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
      now: observedAt,
      text: english,
    });
    outcome.extraction.push(raw);

    const vetted = vetExtraction(raw, {
      text: english,
      detector,
      now: ports.now(),
      resolveRegion: ports.resolveRegion,
    });
    outcome.rejected.push(...vetted.rejected);
    for (const accepted of vetted.accepted) {
      outcome.events.push({
        regionSlug: accepted.regionSlug,
        draft: toEventDraft(accepted, {
          source: item.source,
          url: item.url,
          language: item.language,
          observedAt,
        }),
      });
    }
  }

  if (outcome.events.length > 0) {
    return { ...outcome, status: "published", reason: null };
  }
  if (outcome.rejected.length > 0) {
    return {
      ...outcome,
      status: "rejected",
      reason: outcome.rejected[0].reason,
    };
  }
  return outcome;
}
