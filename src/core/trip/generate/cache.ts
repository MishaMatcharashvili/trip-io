import { sql } from "drizzle-orm";
import { db } from "../../../db/client.ts";
import { PROMPT_VERSION } from "./constraints.ts";
import type { PlanCache } from "./pipeline.ts";
import type { Plan } from "./plan.ts";

// The warm-start cache. It stores the untimed plan only: a hit is re-timed for
// the requested dates and re-validated before it is used, because weekday
// opening hours and sunset move with the date.

/** Long enough to help a season's traffic, short enough to follow the catalogue. */
const TTL_DAYS = 30;

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
