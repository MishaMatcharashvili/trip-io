// A real trip for a real account, so the web client has something to render
// while nobody has planned one yet. It runs the same generation a traveller's
// /new does, starting yesterday by default so the trip is live: one day done,
// one day today, the rest ahead.
//
//   npm run seed:trip -- --email you@example.com
//   npm run seed:trip -- --email you@example.com --areas kazbegi-corridor,kakheti --days 6
//   npm run seed:trip -- --email you@example.com --model      # compose with OpenAI
//
// Without --model the composer is skipped and the pipeline's deterministic
// template plan is used: no API key, no cost, the same trip every time. Sign up
// in the app first; the account must exist.

import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { generateTrip } from "../../src/bll/trip-generation.ts";
import { db } from "../../src/dal/client.ts";
import { user } from "../../src/dal/schema/index.ts";
import {
  type FocusAreaSlug,
  focusAreaSlugs,
} from "../../src/domain/catalogue/focus-areas.ts";
import { dayKey } from "../../src/domain/trip/document.ts";
import type { Composer } from "../../src/domain/trip/generate/pipeline.ts";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    areas: { type: "string", default: "tbilisi-core,kazbegi-corridor" },
    days: { type: "string", default: "5" },
    // Days from today the trip starts on; -1 makes today its second day.
    start: { type: "string", default: "-1" },
    model: { type: "boolean", default: false },
  },
});

if (!values.email) {
  console.error("usage: npm run seed:trip -- --email you@example.com");
  process.exit(1);
}

const [owner] = await db
  .select({ id: user.id })
  .from(user)
  .where(eq(user.email, values.email));
if (!owner) {
  console.error(`no account for ${values.email} — sign up in the app first`);
  process.exit(1);
}

const areas = values.areas.split(",") as FocusAreaSlug[];
for (const area of areas) {
  if (!focusAreaSlugs.includes(area)) {
    console.error(`unknown area ${area}; one of ${focusAreaSlugs.join(", ")}`);
    process.exit(1);
  }
}

const skipModel: Composer = async () => {
  throw new Error("seed: composer skipped, template plan wanted");
};

const result = await generateTrip(
  {
    startDate: dayKey(Date.now() + Number(values.start) * 86_400_000),
    days: Number(values.days),
    areas,
    pace: "moderate",
    interests: ["heritage", "nature", "food"],
    party: { adults: 2, children: 0 },
    mobility: "moderate",
    budgetEur: 900,
  },
  owner.id,
  values.model ? {} : { compose: skipModel },
);

if (!result.ok) {
  console.error(JSON.stringify(result, null, 1));
  process.exit(1);
}

const stops = Object.keys(result.doc.nodes).length;
const base = process.env.APP_URL ?? "http://localhost:3000";
console.log(`${stops} stops from ${result.source} → ${base}/trips/${result.tripId}`);
process.exit(0);
