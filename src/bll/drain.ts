import { randomUUID } from "node:crypto";
import { claim, complete, fail, type Job } from "../dal/jobs.ts";
import { judgeMatch } from "./judge.ts";
import { JUDGE_JOB } from "./match.ts";

// The twenty lines that make the system survive a spike.
//
// Vercel kills a function at 800s. Judging is N model calls against a backlog
// whose size we do not control, and a run that dies at the ceiling saves no
// partial progress. So this claims a few jobs at a time, watches the clock, and
// stops cleanly with everything it finished already committed. The next
// minute's invocation continues from where it stopped, and overlapping
// invocations are safe because `SKIP LOCKED` makes them so.

/**
 * Well inside Vercel's ceiling. The budget is checked between jobs, not during
 * one, so it has to leave room for the longest single job — a model call.
 */
export const DRAIN_BUDGET_MS = 240_000;

/** Claimed at a time. Small, so a drain that is about to stop wastes little. */
export const DRAIN_BATCH = 5;

export type Handler = (payload: unknown) => Promise<unknown>;

export const handlers: Record<string, Handler> = {
  [JUDGE_JOB]: async (payload) => {
    const { matchId } = payload as { matchId?: string };
    if (typeof matchId !== "string") {
      throw new Error("judge job has no matchId");
    }
    return judgeMatch(matchId);
  },
};

export type DrainReport = {
  claimed: number;
  completed: number;
  failed: number;
  /** True when the clock, not an empty queue, is why this stopped. */
  outOfTime: boolean;
  ms: number;
};

export type DrainOptions = {
  budgetMs?: number;
  batch?: number;
  worker?: string;
  now?: () => number;
  /**
   * Overrides the registry above. The queue's mechanics — claiming, the time
   * budget, backoff, giving up — are worth exercising without paying a model,
   * and `npm run smoke:watch` does exactly that.
   */
  handlers?: Record<string, Handler>;
};

export async function drain(options: DrainOptions = {}): Promise<DrainReport> {
  const budgetMs = options.budgetMs ?? DRAIN_BUDGET_MS;
  const batch = options.batch ?? DRAIN_BATCH;
  const worker = options.worker ?? randomUUID();
  const now = options.now ?? Date.now;
  const registry = options.handlers ?? handlers;

  const started = now();
  const elapsed = () => now() - started;

  let claimed = 0;
  let completed = 0;
  let failed = 0;
  let outOfTime = false;

  while (elapsed() < budgetMs) {
    const jobs = await claim(batch, worker);
    if (jobs.length === 0) break;
    claimed += jobs.length;

    for (const job of jobs) {
      const ok = await run(job, registry);
      if (ok) completed++;
      else failed++;

      if (elapsed() >= budgetMs) {
        // Anything still unclaimed simply stays in the queue; anything this
        // batch claimed but did not reach keeps its lock until it times out,
        // which is what LOCK_TIMEOUT is for.
        outOfTime = true;
        break;
      }
    }
    if (outOfTime) break;
  }

  return { claimed, completed, failed, outOfTime, ms: elapsed() };
}

async function run(
  job: Job,
  registry: Record<string, Handler>,
): Promise<boolean> {
  const handler = registry[job.kind];
  if (!handler) {
    await fail(job.id, `no handler for job kind "${job.kind}"`);
    return false;
  }
  try {
    await handler(job.payload);
    await complete(job.id);
    return true;
  } catch (error) {
    await fail(job.id, (error as Error).stack ?? String(error));
    return false;
  }
}
