import { sql } from "drizzle-orm";
import { PROMPT_VERSION } from "../domain/trip/generate/constraints.ts";
import type {
  Attempt,
  PlanCache,
  Source,
} from "../domain/trip/generate/pipeline.ts";
import type { Plan } from "../domain/trip/generate/plan.ts";
import { db } from "./client.ts";

// Trip generation's two side tables: the warm-start cache and the generation
// log. The pipeline declares `PlanCache` as a port and never learns that either
// of these is Postgres.

/** Long enough to help a season's traffic, short enough to follow the catalogue. */
const TTL_DAYS = 30;

// The cache stores the untimed plan only: a hit is re-timed for the requested
// dates and re-validated before it is used, because weekday opening hours and
// sunset move with the date.
export const planCache: PlanCache = {
  async get(key) {
    const rows = await db.execute(sql`
      UPDATE plan_cache SET hits = hits + 1
      WHERE key = ${key} AND prompt_version = ${PROMPT_VERSION} AND expires_at > now()
      RETURNING plan
    `);
    return (rows.rows[0]?.plan as Plan | undefined) ?? null;
  },

  async put(key, plan) {
    await db.execute(sql`
      INSERT INTO plan_cache (key, plan, prompt_version, expires_at)
      VALUES (${key}, ${JSON.stringify(plan)}::jsonb, ${PROMPT_VERSION},
              now() + ${`${TTL_DAYS} days`}::interval)
      ON CONFLICT (key) DO UPDATE SET
        plan = EXCLUDED.plan, prompt_version = EXCLUDED.prompt_version,
        expires_at = EXCLUDED.expires_at, created_at = now(), hits = 0
    `);
  },

  async drop(key) {
    await db.execute(sql`DELETE FROM plan_cache WHERE key = ${key}`);
  },
};

/**
 * One row per generation, successful or not. How often the model invents a
 * place, and what the validator threw out, is a kill-criteria input (Phase 9)
 * and this is the only place it is recorded.
 */
export async function recordGeneration(
  tripId: string | null,
  cacheKey: string,
  source: Source | "failed",
  attempts: Attempt[],
): Promise<void> {
  await db.execute(sql`
    INSERT INTO trip_generation (trip_id, cache_key, source, attempts)
    VALUES (${tripId}, ${cacheKey}, ${source},
            ${JSON.stringify(attempts)}::jsonb)
  `);
}
