import { sql } from "drizzle-orm";
import { db } from "../../../db/client.ts";
import { type Constraints, cacheKey } from "./constraints.ts";
import type { Attempt, Source } from "./pipeline.ts";

/**
 * One row per generation, successful or not. How often the model invents a
 * place, and what the validator threw out, is a kill-criteria input (Phase 9)
 * and this is the only place it is recorded.
 */
export async function recordGeneration(
  tripId: string | null,
  constraints: Constraints,
  source: Source | "failed",
  attempts: Attempt[],
): Promise<void> {
  await db.execute(sql`
    INSERT INTO trip_generation (trip_id, cache_key, source, attempts)
    VALUES (${tripId}, ${cacheKey(constraints)}, ${source},
            ${JSON.stringify(attempts)}::jsonb)
  `);
}
