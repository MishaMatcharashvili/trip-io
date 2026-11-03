import { sql } from "drizzle-orm";
import type { Listing } from "../domain/catalogue/listings.ts";
import type { RatedKind } from "../domain/catalogue/ratings.ts";
import type { LonLat } from "../domain/geo.ts";
import { list } from "./area-predicate.ts";
import { db } from "./client.ts";

// `tripadvisor_listing`: Tripadvisor's destination lists as last read. A list is
// replaced whole when a new one is read, so a place that fell off it goes too.
// The `city` column holds the destination's slug.

/**
 * Keeps a destination's new list of one kind and drops what is no longer on
 * it. An empty list changes nothing: a read that found nothing is not a town
 * that closed.
 */
export async function saveListings(
  destination: string,
  kind: RatedKind,
  listings: readonly Listing[],
  fetchedAt: Date,
): Promise<void> {
  if (listings.length === 0) return;
  for (let i = 0; i < listings.length; i += 500) {
    const values = sql.join(
      listings
        .slice(i, i + 500)
        .map(
          (l) =>
            sql`(${l.id}, ${kind}, ${destination}, ${l.name}, ST_SetSRID(ST_MakePoint(${l.lonLat[0]}, ${l.lonLat[1]}), 4326)::geography, ${l.rating}::real, ${l.count}::int, ${l.ranking?.rank ?? null}::int, ${l.ranking?.of ?? null}::int, ${l.url}, ${fetchedAt.toISOString()}::timestamptz)`,
        ),
      sql`, `,
    );
    await db.execute(sql`
      INSERT INTO tripadvisor_listing
        (id, kind, city, name, geom, rating, review_count, rank, rank_of, url, fetched_at)
      VALUES ${values}
      ON CONFLICT (id) DO UPDATE SET
        kind = EXCLUDED.kind, city = EXCLUDED.city, name = EXCLUDED.name,
        geom = EXCLUDED.geom, rating = EXCLUDED.rating,
        review_count = EXCLUDED.review_count, rank = EXCLUDED.rank,
        rank_of = EXCLUDED.rank_of, url = EXCLUDED.url,
        fetched_at = EXCLUDED.fetched_at
    `);
  }
  await db.execute(sql`
    DELETE FROM tripadvisor_listing
    WHERE city = ${destination} AND kind = ${kind}
      AND id NOT IN (${list(listings.map((l) => l.id))})
  `);
}

/** A destination's list of one kind, best ranked first; empty when never read. */
export async function listingsFor(
  destination: string,
  kind: RatedKind,
): Promise<Listing[]> {
  const rows = await db.execute(sql`
    SELECT id, kind, city, name, rating, review_count, rank, rank_of, url,
           ST_X(geom::geometry) AS lon, ST_Y(geom::geometry) AS lat
    FROM tripadvisor_listing
    WHERE city = ${destination} AND kind = ${kind}
    ORDER BY rank NULLS LAST, review_count DESC
  `);
  return rows.rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as RatedKind,
    destination: r.city as string,
    name: r.name as string,
    lonLat: [Number(r.lon), Number(r.lat)] as LonLat,
    rating: r.rating === null ? null : Number(r.rating),
    count: Number(r.review_count),
    ranking:
      r.rank === null || r.rank_of === null
        ? null
        : { rank: Number(r.rank), of: Number(r.rank_of) },
    url: (r.url as string | null) ?? null,
  }));
}

/** Every destination a list has been read for: what a refresh reads again. */
export async function listedDestinations(): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT DISTINCT city FROM tripadvisor_listing ORDER BY city
  `);
  return rows.rows.map((r) => r.city as string);
}
