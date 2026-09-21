import { enqueue } from "../dal/jobs.ts";
import { claimForJudging, matchEvents } from "../dal/matches.ts";

// Stage 3, wired up. The join is the data layer's (src/dal/matches.ts); what
// lives here is the order: match, then claim, then enqueue.
//
// The matcher never calls a model. It writes rows and posts jobs, which is what
// lets it finish in a cron window whatever the backlog looks like — the drain
// handler is where the time is actually spent.

export const JUDGE_JOB = "judge";

/** Enough that a busy hour clears; small enough that one run stays bounded. */
export const MATCH_LIMIT = 500;

export type MatchReport = {
  matched: number;
  queued: number;
  ms: number;
};

export async function runMatch(limit = MATCH_LIMIT): Promise<MatchReport> {
  const started = Date.now();
  const matched = await matchEvents(limit);

  // Claimed separately rather than straight from the insert, because pairs
  // reopened by an escalating forecast are also waiting and have no new row to
  // return. Setting `queued_at` under a `WHERE queued_at IS NULL` is what makes
  // this safe to run twice.
  const claimed = await claimForJudging(limit);
  for (const pair of claimed) {
    await enqueue(JUDGE_JOB, { matchId: pair.id });
  }

  return {
    matched: matched.length,
    queued: claimed.length,
    ms: Date.now() - started,
  };
}
