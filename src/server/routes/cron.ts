import { Hono } from "hono";
import { drain } from "@/bll/drain.ts";
import { runMatch } from "@/bll/match.ts";
import { senseWeather } from "@/bll/sense.ts";
import { requireCronSecret } from "../cron.ts";

// The pipeline's clock. Every handler here is invoked by Vercel Cron (see
// vercel.json) and returns what it did, because in Phase 3 the logs are the
// product: nothing is delivered, so reading these responses is how the system
// gets watched before it is allowed to speak.
//
// Handlers enqueue; they never call a model. That rule is what keeps a cron
// invocation inside its ceiling whatever the backlog looks like — see
// src/bll/drain.ts.

export const cron = new Hono()
  .use(requireCronSecret)

  // 0 * * * * — hourly, one forecast per region with a live trip.
  .get("/sense-weather", async (c) => c.json(await senseWeather()))

  // */5 * * * * — the spatiotemporal join, then the judge queue.
  .get("/match", async (c) => c.json(await runMatch()))

  // * * * * * — claim, judge, stop at 240s, let the next minute continue.
  .get("/drain", async (c) => c.json(await drain()));
