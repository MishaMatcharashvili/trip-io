import { defineConfig } from "@trigger.dev/sdk";

// Trigger.dev is the pipeline's clock, and nothing else — see trigger/watch-pipeline.ts.
//
// The project ref comes from the environment rather than being hard-coded, so a
// deploy against an unconfigured machine fails with a sentence instead of
// silently publishing tasks into someone else's project.

const project = process.env.TRIGGER_PROJECT_REF;
if (!project) {
  throw new Error(
    "TRIGGER_PROJECT_REF is not set — copy it from the Trigger.dev dashboard (Project settings). See context/running-the-pipeline.md.",
  );
}

export default defineConfig({
  project,
  dirs: ["./trigger"],
  // A project-wide ceiling. The one task here sets its own; this is the
  // backstop for anything added later that forgets to.
  maxDuration: 600,
});
