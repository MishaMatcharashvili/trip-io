import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { foundationsPage, indexPage } from "./cards.ts";
import { type Flow, screenPage } from "./page.ts";
import { active } from "./screens/active.ts";
import { briefing } from "./screens/briefing.ts";
import { onboarding } from "./screens/onboarding.ts";
import { plan } from "./screens/plan.ts";
import { trips } from "./screens/trips.ts";

/**
 * Builds the mobile design bundle into `design/mobile/`: one self-contained
 * HTML card per screen, each drawing the screen in light and dark, plus a
 * foundations card and an index. The folder is what gets pushed to the
 * "trip.io Mobile" Claude Design project, so it is regenerated whole — never
 * edit the output by hand; change the screen modules beside this file.
 *
 *   pnpm design:mobile
 */

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../design/mobile",
);

const flows: Flow[] = [onboarding, plan, trips, active, briefing];

rmSync(OUT, { recursive: true, force: true });

function write(path: string, html: string) {
  const file = join(OUT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

write("index.html", indexPage(flows));
write("foundations.html", foundationsPage());
for (const flow of flows) {
  for (const screen of flow.screens) {
    write(`${flow.slug}/${screen.slug}.html`, screenPage(flow.group, screen));
  }
}

const count = flows.reduce((n, f) => n + f.screens.length, 0);
console.log(`design/mobile: ${count} screens in ${flows.length} flows`);
