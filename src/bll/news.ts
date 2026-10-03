import { upsertCorroborated, upsertEvent } from "../dal/events.ts";
import { enqueue } from "../dal/jobs.ts";
import {
  loadItem,
  markItem,
  type NewItem,
  regionSlugs,
  storeItems,
} from "../dal/source-items.ts";
import { toWorldEvent } from "../domain/watch/event.ts";
import type { Extractor, Translator } from "../domain/watch/extraction.ts";
import { type FeedItem, itemText } from "../domain/watch/feed.ts";
import { resolveRegion } from "../domain/watch/gazetteer.ts";
import { readItem } from "../domain/watch/read-item.ts";
import {
  enabledNewsSources,
  NEWS_SOURCES,
  type NewsSource,
} from "../domain/watch/sources.ts";
import { extractWithOpenAI } from "../infra/openai-extract.ts";
import { translateWithOpenAI } from "../infra/openai-translate.ts";
import { fetchFeed } from "../infra/rss.ts";

// Detector #3 (events), end to end, in the two halves the queue requires:
//
//   senseNews     fetch each feed, store what is new, enqueue a job per item.
//                 No model: it runs inside a cron window whatever the backlog.
//   extractItem   the job. Translate, gate, extract, vet, write events.
//
// The matcher then sees the events like any other and the judge decides whether
// a stop is affected. Nothing here knows whether anyone cares.

export const EXTRACT_JOB = "extract";

export type SourceReport = {
  source: string;
  fetched: number;
  stored: number;
  error?: string;
};

export type NewsReport = {
  sources: number;
  /** New items stored, each with an extract job behind it. */
  queued: number;
  failed: number;
  bySource: SourceReport[];
  ms: number;
};

export type SenseNewsDeps = {
  fetch?: (url: string) => Promise<FeedItem[]>;
  sources?: readonly NewsSource[];
};

export async function senseNews(deps: SenseNewsDeps = {}): Promise<NewsReport> {
  const started = Date.now();
  const fetchItems = deps.fetch ?? fetchFeed;
  const sources = deps.sources ?? enabledNewsSources();

  const bySource: SourceReport[] = [];
  let queued = 0;
  for (const source of sources) {
    try {
      const items = await fetchItems(source.url);
      const fresh: NewItem[] = items.map((i) => ({
        url: i.url,
        text: itemText(i),
        publishedAt: i.publishedAt,
      }));
      const ids = await storeItems(source.id, source.language, fresh);
      for (const itemId of ids) await enqueue(EXTRACT_JOB, { itemId });
      queued += ids.length;
      bySource.push({
        source: source.id,
        fetched: items.length,
        stored: ids.length,
      });
    } catch (error) {
      // One outlet being down must not cost the others their poll.
      bySource.push({
        source: source.id,
        fetched: 0,
        stored: 0,
        error: (error as Error).message,
      });
    }
  }

  return {
    sources: sources.length,
    queued,
    failed: bySource.filter((s) => s.error).length,
    bySource,
    ms: Date.now() - started,
  };
}

export type ExtractDeps = {
  translate?: Translator;
  extract?: Extractor;
  now?: () => Date;
};

export type ExtractReport =
  | { skipped: "missing" | "already-read" }
  | { status: string; reason: string | null; events: number };

export async function extractItem(
  itemId: string,
  deps: ExtractDeps = {},
): Promise<ExtractReport> {
  const item = await loadItem(itemId);
  if (!item) return { skipped: "missing" };
  // A job retried after it succeeded, or a duplicate: never pay twice.
  if (item.status !== "new") return { skipped: "already-read" };

  const slugs = await regionSlugs();
  const now = deps.now ?? (() => new Date());
  const detectors =
    NEWS_SOURCES.find((s) => s.id === item.source)?.detectors ?? [];

  const outcome = await readItem(item, detectors, {
    translate: deps.translate ?? translateWithOpenAI,
    extract: deps.extract ?? extractWithOpenAI,
    resolveRegion: (place) => resolveRegion(place, slugs),
    now,
  });

  const observedAt = now().toISOString();
  let written = 0;
  for (const { draft, regionSlug } of outcome.events) {
    const event = toWorldEvent(draft, regionSlug, observedAt);
    // Safety claims join the row other outlets wrote; the matcher waits for two.
    const row = draft.kind.startsWith("safety.")
      ? await upsertCorroborated(draft, event)
      : await upsertEvent(draft, event);
    if (row) written++;
  }

  await markItem(itemId, {
    status: outcome.status,
    reason: outcome.reason,
    english: outcome.english,
    extraction: outcome.extraction,
  });
  return { status: outcome.status, reason: outcome.reason, events: written };
}
