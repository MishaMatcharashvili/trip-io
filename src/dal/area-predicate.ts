import { type SQL, sql } from "drizzle-orm";
import type { AreaMatch } from "@/domain/catalogue/focus-areas.ts";

// How a focus area becomes a predicate over `place p`. The area itself is a
// domain concept (focus-areas.ts); turning one into SQL is this layer's job, and
// keeping the translation in one place is what makes the curation queue and trip
// generation agree on what "the Kazbegi corridor" means.

/** A SQL value list for an IN (...) clause. */
export const list = (values: readonly (string | number)[]) =>
  sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  );

export function areaPredicate(match: AreaMatch): SQL {
  switch (match.kind) {
    case "bbox":
      return sql`ST_Intersects(p.geom, ST_MakeEnvelope(${match.west}, ${match.south}, ${match.east}, ${match.north}, 4326)::geography)`;
    case "isoRegion":
      return sql`EXISTS (SELECT 1 FROM region r WHERE r.iso_region = ${match.code} AND ST_Intersects(r.geom, p.geom))`;
    case "regions": {
      const inRegions = sql`EXISTS (SELECT 1 FROM region r WHERE r.slug IN (${list(match.slugs)}) AND ST_Intersects(r.geom, p.geom))`;
      if (!match.nearCorridor) return inRegions;
      return sql`${inRegions} AND EXISTS (SELECT 1 FROM corridor c WHERE c.slug = ${match.nearCorridor.slug} AND ST_DWithin(c.geom, p.geom, ${match.nearCorridor.withinM}))`;
    }
  }
}
