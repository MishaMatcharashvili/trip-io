import { sql } from "drizzle-orm";
import { PROMPT_VERSION } from "../domain/trip/generate/constraints.ts";
import type {
  Attempt,
  PlanCache,
  Source,
} from "../domain/trip/generate/pipeline.ts";
import type { Plan } from "../domain/trip/generate/plan.ts";
import { db } from "./client.ts";

// Trip generation's side tables: the warm-start cache, the generation log and
// the build requests. The pipeline declares `PlanCache` as a port and never learns that either
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
  source: Source | "failed" | "cancelled",
  attempts: Attempt[],
): Promise<void> {
  await db.execute(sql`
    INSERT INTO trip_generation (trip_id, cache_key, source, attempts)
    VALUES (${tripId}, ${cacheKey}, ${source},
            ${JSON.stringify(attempts)}::jsonb)
  `);
}

/** A pending claim this old belongs to a function that is no longer running. */
const STALE_CLAIM = "5 minutes";

export type RequestState =
  | { status: "pending" }
  | { status: "done"; tripId: string }
  | { status: "cancelled" };

const stateOf = (row: Record<string, unknown>): RequestState =>
  row.status === "done" && row.trip_id
    ? { status: "done", tripId: String(row.trip_id) }
    : row.status === "pending"
      ? { status: "pending" }
      : // Cancelled, or built and since deleted: either way there is nothing to open.
        { status: "cancelled" };

/** Where one of this traveller's build requests stands, or null if there is none. */
export async function requestState(
  id: string,
  userId: string,
): Promise<RequestState | null> {
  const rows = await db.execute(sql`
    SELECT status, trip_id FROM generation_request
    WHERE id = ${id} AND user_id = ${userId}
  `);
  return rows.rows[0] ? stateOf(rows.rows[0]) : null;
}

/**
 * Takes the request for this caller, in one statement so two callers cannot
 * both get it. "claimed" means build it; anything else is where the request
 * already stands. An id that is someone else's reads as pending: it is never
 * built twice and never reveals a trip.
 */
export async function claimRequest(
  id: string,
  userId: string,
): Promise<{ status: "claimed" } | RequestState> {
  const claimed = await db.execute(sql`
    INSERT INTO generation_request (id, user_id) VALUES (${id}, ${userId})
    ON CONFLICT (id) DO UPDATE SET created_at = now()
      WHERE generation_request.user_id = ${userId}
        AND generation_request.status = 'pending'
        AND generation_request.created_at < now() - ${STALE_CLAIM}::interval
    RETURNING id
  `);
  if (claimed.rows[0]) return { status: "claimed" };
  return (await requestState(id, userId)) ?? { status: "pending" };
}

/** Marks the request built. False when it was cancelled in the meantime. */
export async function finishRequest(
  id: string,
  tripId: string,
): Promise<boolean> {
  const rows = await db.execute(sql`
    UPDATE generation_request SET status = 'done', trip_id = ${tripId}
    WHERE id = ${id} AND status = 'pending'
    RETURNING id
  `);
  return rows.rows.length > 0;
}

/** Forgets a request that failed, so the same id can be tried again. */
export async function releaseRequest(id: string): Promise<void> {
  await db.execute(
    sql`DELETE FROM generation_request WHERE id = ${id} AND status = 'pending'`,
  );
}

/**
 * Cancels a request that has not finished — including one whose claim has not
 * landed yet, which is then refused when it does. False when it had already
 * been built.
 */
export async function cancelRequest(
  id: string,
  userId: string,
): Promise<boolean> {
  const rows = await db.execute(sql`
    INSERT INTO generation_request (id, user_id, status)
    VALUES (${id}, ${userId}, 'cancelled')
    ON CONFLICT (id) DO UPDATE SET status = 'cancelled'
      WHERE generation_request.user_id = ${userId}
        AND generation_request.status = 'pending'
    RETURNING id
  `);
  return rows.rows.length > 0;
}
