import { logger, schedules } from "@trigger.dev/sdk";

// The clock, and only the clock.
//
// Vercel Hobby cron runs once a day and rejects anything finer at deploy time,
// which is what failed the first Phase 3 deployment. Rather than pay for Vercel
// Pro to get a timer, the timer lives here and the work stays where it already
// is: this task calls the three `/api/cron/*` handlers over HTTP and does none
// of their work itself.
//
// That division is deliberate. The pipeline's queue is a Postgres table drained
// inside a Vercel function (context/architecture.md), and it is built, tested
// and exercised. Moving execution here would make `job` and the drain redundant
// and is a decision worth making on evidence in Phase 5, not in passing. If it
// ever is made, `judgeMatch(matchId)` is already a plain function this file
// could call directly — which is what the layering was for.
//
// One task, not three schedules: the handlers are a pipeline and the order
// matters — sense writes the events match joins, match queues the jobs drain
// runs. It also costs one of the free tier's ten schedules instead of three.

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

export const watchPipeline = schedules.task({
  id: "watch-pipeline",
  cron: CRON,
  // Generous: the drain gives itself 240s and the others are quick. This is a
  // ceiling for a hung request, not a budget anything plans against.
  maxDuration: 600,
  run: async () => {
    const base = required("APP_URL").replace(/\/$/, "");
    const secret = required("CRON_SECRET");

    const reports: Record<string, unknown> = {};

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
      // In Phase 3 the logs are the product — nothing is delivered, so the run
      // history here is how the system gets watched before it may speak.
      logger.info(`cron/${stage}`, { body });
    }

    return reports;
  },
});
