import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * PostGIS `geography` columns aren't natively supported by Drizzle. `subtype`
 * pins the column to a shape (e.g. "LineString") where architecture.md specifies
 * one; omit it for columns that hold mixed/unspecified geometry (points or
 * polygons depending on the row).
 *
 * The value is typed as `string`, but a plain `SELECT` returns hex EWKB
 * (`0101000020E6100000...`), not WKT. Read coordinates with `ST_AsText(geom)`
 * or `ST_AsGeoJSON(geom)` rather than parsing this value directly, and write
 * with `ST_GeogFromText(...)`.
 */
export function geography(subtype?: string) {
  return customType<{ data: string; driverData: string }>({
    dataType() {
      return subtype
        ? `geography(${subtype},4326)`
        : "geography(Geometry,4326)";
    },
  });
}

export const id = () => uuid("id").primaryKey().defaultRandom();

export const tstz = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();

export const timestamps = () => ({
  createdAt: tstz("created_at"),
  updatedAt: tstz("updated_at"),
});
