import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema/index.ts";

// Neon's HTTP driver, not a pooled TCP connection: right fit for the short,
// one-shot queries route handlers and cron jobs make (see context/architecture.md's
// note on serverless + Postgres connection exhaustion).
//
// Connecting lazily keeps `next build` working without DATABASE_URL — the build
// imports route modules to collect their config, so throwing at module scope
// would fail CI and preview deploys rather than the request that needs the db.

let instance: NeonHttpDatabase<typeof schema> | undefined;

function connect(): NeonHttpDatabase<typeof schema> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  instance ??= drizzle(neon(process.env.DATABASE_URL), { schema });
  return instance;
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get: (_target, prop, receiver) => Reflect.get(connect(), prop, receiver),
});
