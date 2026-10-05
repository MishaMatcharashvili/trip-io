import { Hono } from "hono";
import { scheduleBriefings } from "@/bll/briefing.ts";
import { drain } from "@/bll/drain.ts";
import { sweepOutcomes } from "@/bll/interventions.ts";
import { runMatch } from "@/bll/match.ts";
import { senseNews } from "@/bll/news.ts";
import { senseRoadNotices } from "@/bll/road-proposals.ts";
import { senseWeather } from "@/bll/sense.ts";
import { requireCronSecret } from "../cron.ts";
import { announceProposals } from "../telegram/proposals.ts";
import { remindOperators } from "../telegram/reminder.ts";

// The pipeline's clock — once there is one. Each handler returns what it did,
// because in Phase 3 the logs are the product: nothing is delivered, so reading
// these responses is how the system gets watched before it is allowed to speak.
//
// Nothing invokes them on a timer yet. Hobby cron runs once a day and rejects a
// sub-daily schedule at deploy time, so the `vercel.json` that schedules these
// cannot ship until Vercel Pro is enabled; `context/architecture.md` holds the
// file to add that day. Until then they are called by hand.
//
// Handlers enqueue; they never call a model. That rule is what keeps a cron
// invocation inside its ceiling whatever the backlog looks like — see
// src/bll/drain.ts.

export const cron = new Hono()
  .use(requireCronSecret)

  // 0 * * * * — hourly, one forecast per region with a live trip.
  .get("/sense-weather", async (c) => c.json(await senseWeather()))

  // Detector #3: fetch the feeds, store what is new, queue a read of each. The
  // reading is a model call and happens in the drain.
  .get("/sense-news", async (c) => c.json(await senseNews()))

  // */5 * * * * — the spatiotemporal join, then the judge queue.
  .get("/match", async (c) => c.json(await runMatch()))

  // * * * * * — claim, judge, stop at 240s, let the next minute continue.
  .get("/drain", async (c) => c.json(await drain()))

  // 0 * * * * — silence past expiry becomes `ignored`. Written by the clock,
  // not left to the client: an acceptance rate whose denominator is only the
  // interventions someone answered is the number that flatters us most.
  .get("/outcomes", async (c) => c.json(await sweepOutcomes()))

  // Road automation, assisted: the Roads Department's newest notices, queued to
  // be read; then, after the drain has read them, tell the operators.
  .get("/sense-roads", async (c) => c.json(await senseRoadNotices()))
  .get("/road-proposals", async (c) => c.json(await announceProposals()))

  // 0 6 * * 1 — Monday 06:00, Tbilisi. Detector #6 is a person; this asks.
  .get("/rail-reminder", async (c) => c.json(await remindOperators()))

  // 30 3 * * * — 07:30 in Tbilisi. One job per live trip-day; the model call
  // itself happens in the drain, like every other one.
  .get("/briefing", async (c) => c.json(await scheduleBriefings()));
