import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

// PostGIS is created here rather than inside a generated migration: drizzle-kit
// doesn't manage extensions, so a hand-edited CREATE EXTENSION would be lost the
// next time the migration is regenerated.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const sql = neon(process.env.DATABASE_URL);

await sql`CREATE EXTENSION IF NOT EXISTS postgis`;
await migrate(drizzle(sql), { migrationsFolder: "./src/dal/migrations" });
