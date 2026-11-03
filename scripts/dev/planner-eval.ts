// Plays the planner's scenarios end to end (src/domain/trip/eval/scenarios.ts)
// and writes down everything that happened: what the traveller said, what the
// planner answered and changed, every model call with its full input and
// output, every other API asked, the plan with its empty stretches measured,
// and each expectation with what was got beside it.
//
//   pnpm planner:eval                     every scenario, talked through and built
//   pnpm planner:eval -- guria            the scenarios whose id has "guria" in it
//   pnpm planner:eval -- --talk-only      stop after the conversation
//   pnpm planner:eval -- --repeat 3       each scenario three times: the model varies
//   pnpm planner:eval -- --trip <uuid>    the evidence for a trip someone built
//
// Writes eval-runs/planner/<when>/report.md, a summary to read first, and one
// JSON file per run with every call in full. Nothing is written to the
// database but the catalogue's own bookkeeping: no trip, no cached plan.
//
// Needs OPENAI_API_KEY and DATABASE_URL; MAPBOX_DIRECTIONS_TOKEN and
// GOOGLE_PLACES_API_KEY as the app has them. Costs a few model calls per turn
// and two or three per build.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planningTurn } from "../../src/bll/intake.ts";
import { GOOGLE_CONTENT_TTL_S } from "../../src/bll/place-enrichment.ts";
import { destinationAt } from "../../src/bll/places.ts";
import { type RatingDeps, ratingDefaults } from "../../src/bll/ratings.ts";
import { sightNamed } from "../../src/bll/sight-search.ts";
import { tripEvidence } from "../../src/bll/trip-evidence.ts";
import { planTrip } from "../../src/bll/trip-generation.ts";
import type { LonLat } from "../../src/domain/geo.ts";
import {
  type CheckResult,
  type PlaceFacts,
  score,
  type TimelineDay,
  type Trace,
  timeline,
} from "../../src/domain/trip/eval/checks.ts";
import {
  type Scenario,
  scenarios,
} from "../../src/domain/trip/eval/scenarios.ts";
import type { Constraints } from "../../src/domain/trip/generate/constraints.ts";
import {
  applyEdit,
  type IntakeMessage,
  type IntakeState,
  initialState,
} from "../../src/domain/trip/generate/intake.ts";
import type {
  Attempt,
  PlanCache,
} from "../../src/domain/trip/generate/pipeline.ts";
import { googleRatings, googleSights } from "../../src/infra/google-places.ts";
import { mapboxDirections } from "../../src/infra/mapbox-directions.ts";
import {
  type ObservedCall,
  observeModelCalls,
} from "../../src/infra/openai.ts";
import { upstashRatings } from "../../src/infra/upstash.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const talkOnly = flag("--talk-only");
const repeat = Math.max(1, Number(option("--repeat") ?? 1));
const tripId = option("--trip");
const filters = args.filter(
  (a, i) =>
    !a.startsWith("--") && !["--repeat", "--trip"].includes(args[i - 1]),
);

const EVAL_USER = "planner-eval";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join("eval-runs", "planner", stamp);
mkdirSync(outDir, { recursive: true });

// ── what the run saw ────────────────────────────────────────────────────────

type ApiCall = {
  provider: string;
  method: string;
  /** The arguments, cut short: enough to tell which call it was. */
  args: string;
  ms: number;
  ok: boolean;
  /** What came back, cut short. */
  result: string;
};

type Logged =
  | ({ type: "model"; at: number } & ObservedCall)
  | ({ type: "api"; at: number } & ApiCall);

let log: Logged[] = [];
observeModelCalls((call) =>
  log.push({ type: "model", at: Date.now(), ...call }),
);

const short = (value: unknown, max = 240) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text === undefined
    ? "undefined"
    : text.length > max
      ? `${text.slice(0, max)}…`
      : text;
};

/** The same object, with every method call written to the log. */
function logged<T extends object>(target: T, provider: string): T {
  return new Proxy(target, {
    get(obj, key, receiver) {
      const value = Reflect.get(obj, key, receiver);
      if (typeof value !== "function") return value;
      return async (...callArgs: unknown[]) => {
        const t0 = Date.now();
        try {
          const result = await value.apply(obj, callArgs);
          const ok =
            !(result && typeof result === "object" && "ok" in result) ||
            Boolean((result as { ok: unknown }).ok);
          log.push({
            type: "api",
            at: t0,
            provider,
            method: String(key),
            args: short(callArgs),
            ms: Date.now() - t0,
            ok,
            result: short(result),
          });
          return result;
        } catch (error) {
          log.push({
            type: "api",
            at: t0,
            provider,
            method: String(key),
            args: short(callArgs),
            ms: Date.now() - t0,
            ok: false,
            result: `threw: ${(error as Error).message}`,
          });
          throw error;
        }
      };
    },
  });
}

// The app's wiring (src/server/routes/trips.ts), each provider logged.
const env = process.env;
const roads = logged(
  mapboxDirections({ token: env.MAPBOX_DIRECTIONS_TOKEN }),
  "mapbox-directions",
);
const ratings: RatingDeps = {
  ...ratingDefaults(),
  source: logged(
    googleRatings({ key: env.GOOGLE_PLACES_API_KEY }),
    "google-places:ratings",
  ),
  kept:
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? logged(
          upstashRatings({
            url: env.UPSTASH_REDIS_REST_URL,
            token: env.UPSTASH_REDIS_REST_TOKEN,
            provider: "google",
          }),
          "upstash:ratings",
        )
      : undefined,
  ttlSeconds: Number(env.GOOGLE_PLACES_CONTENT_TTL_S ?? GOOGLE_CONTENT_TTL_S),
};
const sightFinder = logged(
  googleSights({ key: env.GOOGLE_PLACES_API_KEY }),
  "google-places:sights",
);

/** Composes afresh every time: a cached plan would hide what the model does now. */
const noCache: PlanCache = {
  get: async () => null,
  put: async () => {},
  drop: async () => {},
};

// ── one run ─────────────────────────────────────────────────────────────────

type TurnRecord = {
  said: string;
  reply: string;
  source: "model" | "fallback";
  ready: boolean;
  /** The fields this turn changed, from what to what. */
  changed: Record<string, { from: unknown; to: unknown }>;
  suggestions: string[];
  options: string[];
  unsupported: string[];
  sights: string[];
  ms: number;
};

type BuildRecord =
  | {
      ok: true;
      source: string;
      attempts: Attempt[];
      candidates: {
        total: number;
        byArea: Record<string, number>;
        byGroup: Record<string, number>;
      };
      stations: number;
      timeline: TimelineDay[];
      warnings: string[];
      ms: number;
    }
  | { ok: false; explanations: string[]; attempts: Attempt[]; ms: number };

type Run = {
  scenario: Scenario;
  run: number;
  located: { at: LonLat; place: { slug: string; name: string } | null } | null;
  turns: TurnRecord[];
  constraints: Constraints;
  said: string[];
  build: BuildRecord | null;
  checks: CheckResult[];
  log: Logged[];
};

const count = <T>(xs: readonly T[], key: (x: T) => string) =>
  xs.reduce<Record<string, number>>((acc, x) => {
    acc[key(x)] = (acc[key(x)] ?? 0) + 1;
    return acc;
  }, {});

function changes(before: IntakeState, after: IntakeState) {
  const out: TurnRecord["changed"] = {};
  for (const key of Object.keys(after.constraints) as (keyof Constraints)[]) {
    const from = before.constraints[key];
    const to = after.constraints[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) out[key] = { from, to };
  }
  return out;
}

async function play(scenario: Scenario, run: number): Promise<Run> {
  log = [];
  // The conversation's today is the scenario's, so its weekdays mean the same.
  const now = () => new Date(`${scenario.today}T09:00:00+04:00`);
  let state = initialState(scenario.today);
  let located: Run["located"] = null;
  if (scenario.here) {
    // What /new does with the browser's position (src/features/trip-planner.tsx).
    const place = await destinationAt(scenario.here);
    located = { at: scenario.here, place };
    if (place) state = applyEdit(state, { start: place.slug });
  }

  const messages: IntakeMessage[] = [];
  const turns: TurnRecord[] = [];
  for (const said of scenario.says) {
    messages.push({ role: "traveller", text: said });
    const t0 = Date.now();
    const turn = await planningTurn(EVAL_USER, state, messages, {
      count: async () => 0,
      now,
      sightNamed: (name, route) =>
        sightNamed(sightFinder, EVAL_USER, name, route),
    });
    if (!turn.ok) throw new Error(`turn refused: ${turn.reason}`);
    turns.push({
      said,
      reply: turn.reply,
      source: turn.source,
      ready: turn.ready,
      changed: changes(state, turn.state),
      suggestions: turn.suggestions,
      options: turn.options.map((o) => `${o.title}: ${o.detail}`),
      unsupported: turn.unsupported,
      sights: turn.sights,
      ms: Date.now() - t0,
    });
    messages.push({ role: "planner", text: turn.reply });
    state = turn.state;
  }

  let build: BuildRecord | null = null;
  let traceBuild: Trace["build"] = null;
  const places: Record<string, PlaceFacts> = {};
  if (!talkOnly) {
    const t0 = Date.now();
    const planned = await planTrip(state.constraints, null, {
      roads,
      ratings,
      cache: noCache,
    });
    if (!planned.possible) {
      build = {
        ok: false,
        explanations: planned.explanations,
        attempts: [],
        ms: Date.now() - t0,
      };
      traceBuild = { ok: false, explanations: planned.explanations };
    } else {
      for (const c of [...planned.candidates, ...planned.stations]) {
        places[c.id] = { name: c.name, category: c.category, lonLat: c.lonLat };
      }
      const { result } = planned;
      if (result.ok) {
        build = {
          ok: true,
          source: result.source,
          attempts: result.attempts,
          candidates: {
            total: planned.candidates.length,
            byArea: count(planned.candidates, (c) => c.area),
            byGroup: count(planned.candidates, (c) => c.group),
          },
          stations: planned.stations.length,
          timeline: timeline(result.doc, places),
          warnings: result.warnings.map((w) => `${w.day}: ${w.message}`),
          ms: Date.now() - t0,
        };
        traceBuild = { ok: true, doc: result.doc };
      } else {
        const explanations = result.attempts
          .flatMap((a) => a.problems)
          .slice(0, 5);
        build = {
          ok: false,
          explanations,
          attempts: result.attempts,
          ms: Date.now() - t0,
        };
        traceBuild = { ok: false, explanations };
      }
    }
  }

  const trace: Trace = {
    constraints: state.constraints,
    said: state.said,
    build: traceBuild,
    places,
  };
  return {
    scenario,
    run,
    located,
    turns,
    constraints: state.constraints,
    said: state.said,
    build,
    checks: score(scenario, trace).filter(
      // Without a build there is no plan to judge: those checks are not run.
      (_, i) => !talkOnly || isRequestCheck(scenario.expect[i].kind),
    ),
    log,
  };
}

const REQUEST_CHECKS = new Set([
  "days",
  "startWeekday",
  "places",
  "start",
  "freeNights",
  "notes",
  "interests",
  "dayEnds",
]);
const isRequestCheck = (kind: string) => REQUEST_CHECKS.has(kind);

// ── the report ──────────────────────────────────────────────────────────────

const mark = (pass: boolean) => (pass ? "✅" : "❌");
const passed = (r: Run) => r.checks.filter((c) => c.pass).length;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function timelineMd(days: TimelineDay[], limit: number) {
  return days
    .map((d) => {
      const rows = d.rows.map((r) => {
        const idle =
          r.idleBefore && r.idleBefore > 0
            ? ` ${r.idleBefore > limit ? "⚠️" : "·"} ${r.idleBefore} min idle before`
            : "";
        return `| ${r.from}–${r.to} | ${r.kind} | ${r.title.replace(/\|/g, "/")} |${idle} |`;
      });
      return [
        `**${d.weekday} ${d.date}** — longest idle ${d.longestIdle} min`,
        "",
        "| time | kind | stop | idle |",
        "|---|---|---|---|",
        ...rows,
      ].join("\n");
    })
    .join("\n\n");
}

const IDLE_LIMIT: Record<string, number> = {
  relaxed: 120,
  moderate: 90,
  packed: 60,
};

function runMd(r: Run): string {
  const id = `${r.scenario.id}${repeat > 1 ? ` #${r.run}` : ""}`;
  const out: string[] = [
    `## ${mark(passed(r) === r.checks.length)} ${id} — ${r.scenario.title} (${passed(r)}/${r.checks.length})`,
    "",
    `*Why:* ${r.scenario.origin}`,
    "",
  ];
  if (r.located) {
    out.push(
      `*Browser position:* ${r.located.at.join(", ")} → ${r.located.place ? `${r.located.place.name} (${r.located.place.slug})` : "no destination"}`,
      "",
    );
  }
  out.push("### Conversation", "");
  for (const t of r.turns) {
    out.push(`> **Traveller:** ${t.said}`, ">");
    out.push(
      `> **Planner** (${t.source}, ${secs(t.ms)}${t.ready ? ", ready" : ""}): ${t.reply}`,
    );
    const changed = Object.entries(t.changed).map(
      ([k, v]) => `\`${k}\` ${short(v.from, 60)} → ${short(v.to, 80)}`,
    );
    out.push(
      `>`,
      `> *changed:* ${changed.length ? changed.join("; ") : "nothing"}`,
    );
    if (t.suggestions.length)
      out.push(`> *suggestions:* ${t.suggestions.join(" · ")}`);
    if (t.options.length) out.push(`> *options:* ${t.options.join(" · ")}`);
    if (t.unsupported.length)
      out.push(`> *unsupported:* ${t.unsupported.join(", ")}`);
    if (t.sights.length)
      out.push(`> *sights asked for:* ${t.sights.join(", ")}`);
    out.push("");
  }

  const c = r.constraints;
  const s = (k: string) => (r.said.includes(k) ? "" : " *(assumed)*");
  out.push(
    "### The request it was built from",
    "",
    `- ${c.days} days from ${c.startDate}${s("startDate")}${s("days")}; ${c.start} → ${c.places.join(" → ")} → ${c.finish}${s("start")}`,
    `- ${c.pace} pace${s("pace")}, days end ${c.dayEnds}${s("dayEnds")}, interests ${c.interests.join(", ") || "none"}${s("interests")}`,
    `- party ${c.party.adults}+${c.party.children}${s("party")}, mobility ${c.mobility}${s("mobility")}, €${c.budgetEur}${s("budgetEur")}, own car ${c.ownCar}, free nights ${c.freeNights}`,
    `- notes: ${c.notes ? `"${c.notes}"` : "none"}; must-sees: ${c.mustSee.map((m) => m.name).join(", ") || "none"}`,
    "",
  );

  if (r.build) {
    out.push("### The build", "");
    out.push(
      ...r.build.attempts.map(
        (a, i) =>
          `${i + 1}. ${a.source}: ${a.ok ? "accepted" : "rejected"} in ${secs(a.ms)}${a.invented.length ? `; invented ${a.invented.join(", ")}` : ""}${a.problems.length ? `\n${a.problems.map((p) => `   - ${p}`).join("\n")}` : ""}`,
      ),
      "",
    );
    if (r.build.ok) {
      out.push(
        `Used **${r.build.source}** after ${secs(r.build.ms)}. ${r.build.candidates.total} candidates (${Object.entries(
          r.build.candidates.byArea,
        )
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}; ${Object.entries(r.build.candidates.byGroup)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ")}), ${r.build.stations} stations on the long drives.`,
        "",
      );
      if (r.build.warnings.length) {
        out.push("Warnings:", ...r.build.warnings.map((w) => `- ${w}`), "");
      }
      out.push(timelineMd(r.build.timeline, IDLE_LIMIT[c.pace]), "");
    } else {
      out.push(`**No plan.** ${r.build.explanations.join(" ")}`, "");
    }
  }

  out.push(
    "### Checks",
    "",
    "| | expected | got |",
    "|---|---|---|",
    ...r.checks.map(
      (k) =>
        `| ${mark(k.pass)} | ${k.expected} | ${k.got.replace(/\|/g, "/")} |`,
    ),
    "",
    "### Calls",
    "",
    "| when | to | ms | in→out tokens | ok | what |",
    "|---|---|---|---|---|---|",
  );
  const t0 = r.log[0]?.at ?? 0;
  for (const l of r.log) {
    const when = `+${secs(l.at - t0)}`;
    out.push(
      l.type === "model"
        ? `| ${when} | openai ${l.purpose} | ${l.latencyMs} | ${l.inputTokens}→${l.outputTokens} | ${mark(!l.error)} | ${short(l.error ?? l.output, 160).replace(/\|/g, "/")} |`
        : `| ${when} | ${l.provider}.${l.method} | ${l.ms} | | ${mark(l.ok)} | ${short(l.args, 80).replace(/\|/g, "/")} → ${short(l.result, 80).replace(/\|/g, "/")} |`,
    );
  }
  out.push("", `Full inputs and outputs: \`${fileOf(r)}\``, "");
  return out.join("\n");
}

const fileOf = (r: Run) => join(outDir, `${r.scenario.id}-${r.run}.json`);

function summaryMd(runs: Run[]): string {
  const failing = new Map<string, { scenario: string; got: string }[]>();
  for (const r of runs) {
    for (const k of r.checks.filter((x) => !x.pass)) {
      const list = failing.get(k.expected) ?? [];
      list.push({ scenario: `${r.scenario.id}#${r.run}`, got: k.got });
      failing.set(k.expected, list);
    }
  }
  return [
    `# Planner eval — ${new Date().toISOString().slice(0, 16)}Z`,
    "",
    `${runs.length} runs${talkOnly ? ", conversation only" : ""}. ${runs.filter((r) => passed(r) === r.checks.length).length} passed every check.`,
    "",
    "| scenario | run | checks | build |",
    "|---|---|---|---|",
    ...runs.map(
      (r) =>
        `| ${mark(passed(r) === r.checks.length)} ${r.scenario.id} | ${r.run} | ${passed(r)}/${r.checks.length} | ${r.build ? (r.build.ok ? `${r.build.source}, ${r.build.attempts.length} attempt(s)` : "failed") : "—"} |`,
    ),
    "",
    "## What failed, by expectation",
    "",
    failing.size
      ? [...failing]
          .map(
            ([expected, list]) =>
              `- **${expected}** (${list.length}×)\n${list.map((f) => `  - ${f.scenario}: ${f.got}`).join("\n")}`,
          )
          .join("\n")
      : "Nothing.",
    "",
  ].join("\n");
}

// ── a trip someone built ────────────────────────────────────────────────────

async function evidenceFor(id: string) {
  const found = await tripEvidence(id);
  if (!found) {
    console.error(`no trip ${id}`);
    process.exit(1);
  }
  const { doc, violations, generations, places } = found;
  const pace = doc.trip.pace;
  const md = [
    `# Trip ${id} — ${doc.trip.title}`,
    "",
    `${doc.trip.startsAt} → ${doc.trip.endsAt}; ${pace} pace; party ${JSON.stringify(doc.trip.party)}; ${doc.trip.budget}`,
    "",
    `prefs: \`${JSON.stringify(doc.trip.prefs)}\``,
    "",
    "## How it was made",
    "",
    ...generations.flatMap((g) => [
      `- ${g.createdAt}: **${g.source}**`,
      ...g.attempts.map(
        (a) =>
          `  - ${a.source} ${a.ok ? "accepted" : "rejected"} in ${secs(a.ms)}${a.problems.map((p) => `\n    - ${p}`).join("")}`,
      ),
    ]),
    "",
    "## The plan",
    "",
    timelineMd(timeline(doc, places), IDLE_LIMIT[pace]),
    "",
    "## What the validator says now",
    "",
    ...(violations.length
      ? violations.map((v) => `- ${v.severity} ${v.day}: ${v.message}`)
      : ["Nothing."]),
    "",
    "The conversation that led to it is not stored; replay it as a scenario to see what the planner did.",
    "",
  ].join("\n");
  const path = join(outDir, `trip-${id}.md`);
  writeFileSync(path, md);
  writeFileSync(
    join(outDir, `trip-${id}.json`),
    JSON.stringify(found, null, 1),
  );
  console.log(md);
  console.log(`\nwritten to ${path}`);
}

// ── main ────────────────────────────────────────────────────────────────────

if (tripId) {
  await evidenceFor(tripId);
  process.exit(0);
}

const chosen = filters.length
  ? scenarios.filter((s) => filters.some((f) => s.id.includes(f)))
  : scenarios;
if (!chosen.length) {
  console.error(`no scenario matches ${filters.join(", ")}`);
  process.exit(1);
}

console.log(`${chosen.length} scenario(s) × ${repeat} → ${outDir}\n`);
const runs: Run[] = [];
for (const scenario of chosen) {
  for (let run = 1; run <= repeat; run++) {
    process.stdout.write(`${scenario.id} #${run} … `);
    const t0 = Date.now();
    let r: Run;
    try {
      r = await play(scenario, run);
    } catch (error) {
      console.log(`crashed: ${(error as Error).message}`);
      continue;
    }
    runs.push(r);
    writeFileSync(fileOf(r), JSON.stringify(r, null, 1));
    console.log(`${passed(r)}/${r.checks.length} in ${secs(Date.now() - t0)}`);
    for (const k of r.checks.filter((x) => !x.pass)) {
      console.log(`    ❌ ${k.expected} — got ${k.got}`);
    }
  }
}

const report = [summaryMd(runs), ...runs.map(runMd)].join("\n\n---\n\n");
const reportPath = join(outDir, "report.md");
writeFileSync(reportPath, report);
console.log(`\nreport: ${reportPath}`);
