import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// `usage_window`: how much of a limited thing has been used in a time window.

/**
 * Counts one use against `key` in the fixed window containing `now`, and
 * returns the count including this use. One statement, so concurrent
 * instances each get a different number: whoever gets one past the limit is
 * the one refused.
 */
export async function countUse(
  key: string,
  windowSeconds: number,
  now: Date,
): Promise<number> {
  const rows = await db.execute(sql`
    INSERT INTO usage_window (key, window_start, count)
    VALUES (
      ${key},
      to_timestamp(floor(extract(epoch FROM ${now.toISOString()}::timestamptz) / ${windowSeconds}) * ${windowSeconds}),
      1
    )
    ON CONFLICT (key, window_start) DO UPDATE SET count = usage_window.count + 1
    RETURNING count
  `);
  return Number(rows.rows[0].count);
}

/** Drops windows old enough that no limit can still be looking at them. */
export async function pruneUsage(olderThan: Date): Promise<void> {
  await db.execute(
    sql`DELETE FROM usage_window WHERE window_start < ${olderThan.toISOString()}::timestamptz`,
  );
}
