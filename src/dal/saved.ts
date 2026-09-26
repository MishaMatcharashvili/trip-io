import { sql } from "drizzle-orm";
import { categoryGroup, isOutdoor } from "../domain/catalogue/categories.ts";
import type { LonLat } from "../domain/geo.ts";
import { db } from "./client.ts";
import type { PlaceHit } from "./places.ts";

// `saved_place`: what a traveller kept for later.

export async function savePlace(
  userId: string,
  placeId: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO saved_place (user_id, place_id) VALUES (${userId}, ${placeId})
    ON CONFLICT DO NOTHING
  `);
}

export async function unsavePlace(
  userId: string,
  placeId: string,
): Promise<void> {
  await db.execute(sql`
    DELETE FROM saved_place WHERE user_id = ${userId} AND place_id = ${placeId}
  `);
}

export async function savedIds(userId: string): Promise<string[]> {
  const rows = await db.execute(
    sql`SELECT place_id FROM saved_place WHERE user_id = ${userId}`,
  );
  return rows.rows.map((r) => r.place_id as string);
}

export type SavedPlaceRow = PlaceHit & { savedAt: string };

/** A traveller's kept places, newest first. */
export async function savedPlacesOf(userId: string): Promise<SavedPlaceRow[]> {
  const rows = await db.execute(sql`
    SELECT p.id, p.name, p.name_ka, p.category, p.tier, s.saved_at,
           ST_X(p.geom::geometry) AS lon, ST_Y(p.geom::geometry) AS lat
    FROM saved_place s JOIN place p ON p.id = s.place_id
    WHERE s.user_id = ${userId}
    ORDER BY s.saved_at DESC
  `);
  return rows.rows.map((r) => {
    const category = r.category as string;
    return {
      id: r.id as string,
      name: r.name as string,
      nameKa: (r.name_ka as string | null) ?? null,
      category,
      group: categoryGroup[category as keyof typeof categoryGroup],
      tier: r.tier as PlaceHit["tier"],
      lonLat: [Number(r.lon), Number(r.lat)] as LonLat,
      outdoor: isOutdoor(category),
      distanceM: null,
      savedAt: new Date(r.saved_at as string).toISOString(),
    };
  });
}
