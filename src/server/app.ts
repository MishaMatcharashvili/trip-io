import { Hono } from "hono";
import { briefings } from "./routes/briefings";
import { cron } from "./routes/cron";
import { curation } from "./routes/curation";
import { devices } from "./routes/devices";
import { interventions } from "./routes/interventions";
import { telegram } from "./routes/telegram";
import { trips } from "./routes/trips";

// Mounted at app/api/[[...route]]/route.ts via hono/vercel. Business logic
// stays in src/domain/*; this file only wires routes.
const app = new Hono()
  .basePath("/api")
  .get("/health", (c) =>
    c.json({ status: "ok", time: new Date().toISOString() }),
  )
  .route("/briefings", briefings)
  .route("/cron", cron)
  .route("/curation", curation)
  .route("/devices", devices)
  .route("/interventions", interventions)
  .route("/telegram", telegram)
  .route("/trips", trips);

export type AppType = typeof app;
export default app;
