import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { StoredItem } from "../domain/watch/read-item.ts";
import { db } from "./client.ts";

// `source_item`: what the news detectors fetched, and what became of it.

export type NewItem = {
  url: string;
  text: string;
  publishedAt: string | null;
};

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Store what a feed returned, and say which of it was new. An item whose text
 * is the same as one already stored — same source, same url, same hash — is
 * skipped, which is what keeps an hourly poll of an unchanged feed from
 * costing a single model call. A page whose text changed is stored again as a
 * new version: a festival's date being corrected is news.
 */
export async function storeItems(
  source: string,
  language: string,
  items: readonly NewItem[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const item of items) {
    const rows = await db.execute(sql`
      INSERT INTO source_item
        (source, url, content_hash, published_at, language, original_text)
      VALUES (${source}, ${item.url}, ${hash(item.text)},
              ${item.publishedAt}::timestamptz, ${language}, ${item.text})
      ON CONFLICT (source, url, content_hash) DO NOTHING
      RETURNING id
    `);
    if (rows.rows[0]) ids.push(rows.rows[0].id as string);
  }
  return ids;
}

export type LoadedItem = StoredItem & { id: string; status: string };

export async function loadItem(id: string): Promise<LoadedItem | null> {
  const rows = await db.execute(sql`
    SELECT id, source, url, language, original_text, text, status,
           published_at
    FROM source_item WHERE id = ${id}
  `);
  const r = rows.rows[0];
  if (!r) return null;
  return {
    id: r.id as string,
    source: r.source as string,
    url: r.url as string,
    language: r.language as string,
    originalText: r.original_text as string,
    text: (r.text as string | null) ?? null,
    status: r.status as string,
    publishedAt: r.published_at
      ? new Date(r.published_at as string).toISOString()
      : null,
  };
}

export async function markItem(
  id: string,
  result: {
    status: "empty" | "rejected" | "published";
    reason: string | null;
    english: string;
    extraction: unknown[];
  },
): Promise<void> {
  await db.execute(sql`
    UPDATE source_item
    SET status = ${result.status}::source_item_status,
        reason = ${result.reason},
        text = ${result.english},
        extraction = ${JSON.stringify(result.extraction)}::jsonb,
        extracted_at = now()
    WHERE id = ${id}
  `);
}

/** Every region slug: the gazetteer's vocabulary. */
export async function regionSlugs(): Promise<Set<string>> {
  const rows = await db.execute(sql`SELECT slug FROM region`);
  return new Set(rows.rows.map((r) => r.slug as string));
}
