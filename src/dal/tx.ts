import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema/index.ts";

// The write path's client. `src/dal/client.ts` uses Neon's HTTP driver, which is
// the right fit for short one-shot queries but throws on `transaction()`.
// Appending a patch has to lock the trip, check it's still head, write the
// patch, sync the node projection and move head as one unit — so it needs a
// real session over the WebSocket driver.
//
// A pool per call, closed afterwards: a serverless invocation may be frozen or
// discarded at any point, and a pool held across invocations leaks connections.

export type Tx = NeonDatabase<typeof schema>;

export async function withTransaction<T>(
  fn: (tx: Parameters<Parameters<Tx["transaction"]>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  // Node has had a global WebSocket since 22; the driver needs one named.
  neonConfig.webSocketConstructor ??= globalThis.WebSocket;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    return await drizzle(pool, { schema }).transaction(fn);
  } finally {
    await pool.end();
  }
}
