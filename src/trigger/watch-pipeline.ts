import { logger, schedules, task } from "@trigger.dev/sdk";

// The watch pipeline's clock, and only the clock.
//
// Vercel Hobby cron runs once a day and rejects anything finer at deploy time,
// which is what failed the first Phase 3 deployment. Rather than pay for Vercel
// Pro to get a timer, the timer lives here and the work stays where it already
// is: these tasks call the three `/api/cron/*` handlers over HTTP and do none
// of their work themselves.
//
// That division is deliberate. The pipeline's queue is a Postgres table drained
// inside a Vercel function (context/architecture.md), and it is built, tested
// and exercised. Moving execution here would make `job` and the drain redundant
// and is a decision worth making on evidence in Phase 5, not in passing. If it
// ever is made, `judgeMatch(matchId)` is already a plain function these tasks
// could call directly — which is what the layering was for.

/** In order. Each one's output is the next one's input. */
const STAGES = ["sense-weather", "match", "drain"] as const;

/**
 * Hourly, which is the cadence the design actually calls for: the weather is
 * re-forecast hourly, and the finer schedules in `context/architecture.md`
 * (match every five minutes, drain every minute) are throughput settings that
 * matter at a scale this project does not have yet. It is also the fastest the
 * Trigger.dev free tier allows, so the two agree for now.
 */
const CRON = "7 * * * *";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set on this Trigger.dev environment`);
  }
  return value;
};

export type StageReports = Record<string, unknown>;

/**
 * One pass of the pipeline. The handlers are a sequence, not three independent
 * jobs — sense writes the events match joins, match queues the jobs drain runs
 * — so they go in one task rather than three schedules. It also costs one of
 * the free tier's ten schedules instead of three.
 */
async function runStages(): Promise<StageReports> {
  const base = required("APP_URL").replace(/\/$/, "");
  const secret = required("CRON_SECRET");

  const reports: StageReports = {};

  for (const stage of STAGES) {
    const response = await fetch(`${base}/api/cron/${stage}`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      // Thrown, not swallowed: a stage that fails silently for a week is how
      // you discover the watch layer stopped watching from a traveller.
      throw new Error(
        `${stage} returned ${response.status}: ${JSON.stringify(body)}`,
      );
    }

    reports[stage] = body;
    // In Phase 3 the logs are the product — nothing is delivered, so this run
    // history is how the system gets watched before it may speak.
    logger.info(`cron/${stage}`, { body });
  }

  return reports;
}

/**
 * The same pass, on demand. Useful from the dashboard when you want a cycle now
 * rather than at seven minutes past — which is most of what you want while the
 * pipeline is still being watched by hand.
 */
export const runWatchPipeline = task({
  id: "run-watch-pipeline",
  maxDuration: 600,
  run: async () => runStages(),
});

/** The clock. */
export const watchPipeline = schedules.task({
  id: "watch-pipeline",
  cron: CRON,
  // Generous: the drain gives itself 240s and the others are quick. This is a
  // ceiling for a hung request, not a budget anything plans against.
  maxDuration: 600,
  run: async () => runStages(),
});
