import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// drizzle-kit quotes any column type missing from its native-type list, and
// that list has `geometry` but not `geography` (node_modules/drizzle-kit/bin.cjs,
// pgNativeTypes). PostGIS columns therefore emit as "geography(Point,4326)",
// which Postgres reads as a literal type name and rejects. Unquoting them after
// generation keeps the fix reproducible instead of hand-edited.

const dir = "./src/db/migrations";

for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
  const path = join(dir, file);
  const sql = readFileSync(path, "utf8");
  const unquoted = sql.replace(/"(geography\([^)"]*\))"/g, "$1");
  if (unquoted !== sql) {
    writeFileSync(path, unquoted);
    console.log(`unquoted geography types in ${file}`);
  }
}
