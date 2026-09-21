import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev is the watch pipeline's clock, and nothing else — see
// src/trigger/watch-pipeline.ts for why the work stays on Vercel.

export default defineConfig({
  project: "proj_jiooubvgtwqbcwheedpd",
  dirs: ["./src/trigger"],
  // A project-wide ceiling. The tasks set their own; this is the backstop for
  // anything added later that forgets to.
  maxDuration: 600,
});
