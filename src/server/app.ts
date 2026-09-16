import { Hono } from "hono";
import { curation } from "./routes/curation";

// Mounted at app/api/[[...route]]/route.ts via hono/vercel. Business logic
// stays in src/core/*; this file only wires routes.
const app = new Hono()
  .basePath("/api")
  .get("/health", (c) =>
    c.json({ status: "ok", time: new Date().toISOString() }),
  )
  .route("/curation", curation);

export type AppType = typeof app;
export default app;
