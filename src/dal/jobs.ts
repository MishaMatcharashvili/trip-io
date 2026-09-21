import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// The queue, as a table. No Redis: at this size a Postgres row plus
// `SKIP LOCKED` is the whole of it, and it inherits transactions, backups and
// one connection string from the database we already run.
//
// It exists because a cron handler must never call a model. Vercel kills a
// function at 800s, judging is N model calls against a backlog whose size we do
// not control, and a run that dies at the ceiling saves no partial progress.
// So cron enqueues, and the drain handler does as much as it can in the time it
// has — the next minute's invocation continues from where it stopped.

export type Job = {
  id: string;
  kind: string;
  payload: unknown;
  attempts: number;
};

/**
 * A worker that dies mid-job leaves its lock behind. Anything held longer than
 * this is assumed dead and reclaimable: comfortably past the 240s a drain gives
 * itself, short enough that a judge job is not stranded for an afternoon.
 */
const LOCK_TIMEOUT = "10 minutes";

/** After this many failures a job stops costing money and starts being evidence. */
export const MAX_ATTEMPTS = 5;

export async function enqueue(
  kind: string,
  payload: unknown,
  runAfter?: Date,
): Promise<string> {
  const rows = await db.execute(sql`
    INSERT INTO job (kind, payload, run_after)
    VALUES (${kind}, ${JSON.stringify(payload)}::jsonb,
            ${runAfter ? runAfter.toISOString() : sql`now()`})
    RETURNING id
  `);
  return rows.rows[0].id as string;
}

/**
 * Claim up to `limit` due jobs. One statement, so it needs no transaction of
 * its own: `SKIP LOCKED` is what makes overlapping drain invocations safe, and
 * two workers racing simply take different rows.
 */
export async function claim(limit: number, worker: string): Promise<Job[]> {
  const rows = await db.execute(sql`
    UPDATE job SET locked_at = now(), locked_by = ${worker},
                   attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM job
      WHERE completed_at IS NULL
        AND run_after <= now()
        AND (locked_at IS NULL OR locked_at < now() - ${LOCK_TIMEOUT}::interval)
      ORDER BY run_after
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING id, kind, payload, attempts
  `);
  return rows.rows.map((r) => ({
    id: r.id as string,
    kind: r.kind as string,
    payload: r.payload,
    attempts: r.attempts as number,
  }));
}

export async function complete(id: string): Promise<void> {
  await db.execute(sql`
    UPDATE job SET completed_at = now(), locked_at = NULL, locked_by = NULL,
                   error = NULL
    WHERE id = ${id}
  `);
}

/**
 * Release a failed job for another try, backing off exponentially, or give up
 * and keep the row. A dead job is never deleted: the error is the only record
 * of what the pipeline could not do.
 */
export async function fail(id: string, error: string): Promise<void> {
  const message = error.slice(0, 2000);
  await db.execute(sql`
    UPDATE job SET
      locked_at = NULL,
      locked_by = NULL,
      error = ${message},
      completed_at = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN now() ELSE NULL END,
      run_after = now() + (power(2, least(attempts, 6)) * interval '1 minute')
    WHERE id = ${id}
  `);
}

export type QueueDepth = { kind: string; due: number; failed: number };

/** What the drain is behind on. Read by the Phase 9 dashboard, and by you. */
export async function queueDepth(): Promise<QueueDepth[]> {
  const rows = await db.execute(sql`
    SELECT kind,
           count(*) FILTER (WHERE completed_at IS NULL)::int AS due,
           count(*) FILTER (WHERE completed_at IS NOT NULL AND error IS NOT NULL)::int AS failed
    FROM job
    GROUP BY kind ORDER BY kind
  `);
  return rows.rows.map((r) => ({
    kind: r.kind as string,
    due: r.due as number,
    failed: r.failed as number,
  }));
}
