import { destination, destinationName } from "../../catalogue/destinations.ts";
import type { LonLat } from "../../geo.ts";
import { dayKey, type TripDoc, type TripHeader } from "../document.ts";
import { CIVIL, sunWindow } from "../sun.ts";
import type { TravelEstimator } from "../travel.ts";
import {
  IMPLICIT_LEG_MAX_MIN,
  type Violation,
  validateDoc,
} from "../validate.ts";
import { misplaced, museumHeavy } from "./balance.ts";
import { cacheKey } from "./cache-key.ts";
import type { Constraints } from "./constraints.ts";
import { fallbackPlan } from "./fallback.ts";
import { idleGaps } from "./idle.ts";
import {
  type Candidate,
  type Plan,
  type RefPlan,
  resolveRefs,
} from "./plan.ts";
import { addDays, DAY_START, HOME_BY_MIN, schedule } from "./schedule.ts";

// constraints → cache? → candidates → compose → resolve refs → schedule → validate
//                          ↑ retry once, with the rejection as feedback ↓
//                                   fallback plan → schedule → validate
//                                   nothing validates → insufficient coverage
//
// Never returns an unvalidated plan. The model and the cache are injected: the
// provider lives only in compose.ts, and every branch here is testable with fakes.

export type CandidateRef = {
  ref: string;
  name: string;
  category: string;
  group: Candidate["group"];
  lonLat: LonLat;
  outdoor: boolean;
  area: Candidate["area"];
  /** Every place on the route it lies in. */
  areas: Candidate["areas"];
  /** Human-readable, e.g. "mon–sat 10:00–18:00; sun closed", or "unknown". */
  hours: string;
};

export type ComposeInput = {
  constraints: Constraints;
  candidates: CandidateRef[];
  days: {
    day: number;
    date: string;
    weekday: string;
    dawn: string;
    dusk: string;
    /** "HH:MM": when the drive from where the trip starts gets there. */
    arrives?: string;
    /** "HH:MM": when the drive to where the trip finishes has to set off. */
    leavesBy?: string;
  }[];
};

export type ComposeFeedback = {
  previous: RefPlan;
  /** Refs that weren't in the candidate list. */
  invented: string[];
  /** Everything the scheduler and validator objected to, in words. */
  problems: string[];
};

export type Composer = (
  input: ComposeInput,
  feedback?: ComposeFeedback,
) => Promise<RefPlan>;

export type PlanCache = {
  get(key: string): Promise<Plan | null>;
  put(key: string, plan: Plan): Promise<void>;
  drop(key: string): Promise<void>;
};

export type Source = "cache" | "model" | "retry" | "template";

export type Attempt = {
  source: Source;
  ok: boolean;
  invented: string[];
  problems: string[];
  error?: string;
  ms: number;
};

export type GenerateDeps = {
  compose: Composer;
  cache: PlanCache;
  /** Places in the requested destinations (candidates.ts). */
  candidates: Candidate[];
  travel: TravelEstimator;
  newId: () => string;
  describeHours: (c: Candidate) => string;
};

export type GenerateResult =
  | {
      ok: true;
      source: Source;
      doc: TripDoc;
      plan: Plan;
      /** Warnings only (pace, unknown hours); errors never get this far. */
      warnings: Violation[];
      attempts: Attempt[];
    }
  | {
      ok: false;
      reason: "insufficient-coverage";
      attempts: Attempt[];
      /** Places on the route with nothing in the catalogue to visit. */
      uncovered: string[];
    };

const MAX_FALLBACK_ROUNDS = 12;

/**
 * What a plan leaves out of the places it was asked to visit. Every one is
 * visited: a plan that quietly skips one is a different trip, and is rejected
 * like any other broken plan. Where the trip starts and finishes is not a
 * place to visit, so no day needs a stop there.
 */
export function routeProblems(
  plan: Plan,
  visits: readonly string[],
  places: ReadonlyMap<string, Candidate>,
): string[] {
  return [...new Set(visits)]
    .filter(
      (slug) =>
        !plan.days.some((d) =>
          d.stops.some((s) => places.get(s.placeId)?.areas.includes(slug)),
        ),
    )
    .map(
      (slug) =>
        `${destinationName(slug)} is on the route but no day has a stop there`,
    );
}

/** Where the traveller leaves from, as the scheduler drives there. */
const finishOf = (c: Constraints) => {
  const at = destination(c.finish);
  return at ? { lonLat: at.lonLat, name: at.name } : null;
};

export function tripHeader(c: Constraints): TripHeader {
  const last = addDays(c.startDate, c.days - 1);
  return {
    title: `${c.days} days in Georgia`,
    startsAt: new Date(`${c.startDate}T00:00:00+04:00`).toISOString(),
    endsAt: new Date(`${last}T23:59:00+04:00`).toISOString(),
    party: c.party,
    pace: c.pace,
    budget: `€${c.budgetEur}`,
    prefs: {
      places: c.places,
      start: c.start,
      finish: c.finish,
      interests: c.interests,
      mobility: c.mobility,
    },
  };
}

/** Short refs ("p1"…) the model sees instead of UUIDs, in a stable order. */
export function candidateRefs(candidates: readonly Candidate[]) {
  const sorted = [...candidates].sort((a, b) => (a.id < b.id ? -1 : 1));
  const toId = new Map(sorted.map((c, i) => [`p${i + 1}`, c.id]));
  const toRef = new Map(sorted.map((c, i) => [c.id, `p${i + 1}`]));
  return { sorted, toId, toRef };
}

const localHhmm = (d: Date) =>
  new Date(d.getTime() + 4 * 3_600_000).toISOString().slice(11, 16);

/** "HH:MM" moved by some minutes, to the five, on a clock that does not wrap. */
const shifted = (hhmm: string, minutes: number) => {
  const m =
    Math.round(
      (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + minutes) / 5,
    ) * 5;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * When the first day gets there and when the last has to set off home, by
 * the same drives and the same rule as the scheduler: told only the drive, a
 * model fills a day trip to Kutaisi as if it had the whole day there, and
 * both its tries miss the drive home.
 */
function dayLimits(
  c: Constraints,
  travel: TravelEstimator,
): { arrives?: string; leavesBy?: string } {
  const drive = (a: string, b: string) => {
    const from = destination(a)?.lonLat;
    const to = destination(b)?.lonLat;
    const minutes = from && to && a !== b ? travel.minutes(from, to) : 0;
    return minutes > IMPLICIT_LEG_MAX_MIN ? minutes : 0;
  };
  const there = drive(c.start, c.places[0]);
  const home = drive(c.places[c.places.length - 1], c.finish);
  return {
    ...(there ? { arrives: shifted(DAY_START[c.pace], there) } : {}),
    ...(home ? { leavesBy: shifted(c.dayEnds, HOME_BY_MIN - home) } : {}),
  };
}

export async function generate(
  c: Constraints,
  deps: GenerateDeps,
): Promise<GenerateResult> {
  const attempts: Attempt[] = [];

  // Nothing to build a day out of: say so before spending a model call. This is
  // the honest answer for an area with no curated or verified places.
  const visitable = deps.candidates.filter(
    (p) => p.group !== "lodging" && p.group !== "transport",
  );
  const uncovered = [...new Set(c.places)].filter(
    (slug) => !visitable.some((p) => p.areas.includes(slug)),
  );
  if (uncovered.length > 0) {
    return { ok: false, reason: "insufficient-coverage", attempts, uncovered };
  }

  const places = new Map(deps.candidates.map((p) => [p.id, p]));
  const header = tripHeader(c);

  /** Schedule and validate. Problems are what a retry or the fallback acts on. */
  const evaluate = (plan: Plan) => {
    const { nodes, problems } = schedule({
      plan,
      startDate: c.startDate,
      pace: c.pace,
      places,
      travel: deps.travel,
      newId: deps.newId,
      start: destination(c.start)?.lonLat ?? null,
      finish: finishOf(c),
      dayEnds: c.dayEnds,
    });
    const doc: TripDoc = { trip: header, nodes };
    const violations = validateDoc(doc, {
      places,
      travel: deps.travel,
      author: "system",
    });
    const errors = violations.filter((v) => v.severity === "error");

    const busyDays = new Set(
      Object.values(nodes)
        .filter((n) => n.kind === "visit")
        .map((n) => dayKey(n.startsAt)),
    );
    const empty = Array.from({ length: c.days }, (_, i) =>
      addDays(c.startDate, i),
    )
      .filter((d) => !busyDays.has(d))
      .map((d) => `${d}: nothing to see that day`);

    const offending = new Set([
      ...problems.map((p) => p.placeId),
      ...errors.flatMap((v) =>
        v.nodeIds
          .map((id) => nodes[id]?.placeId)
          .filter((id): id is string => !!id),
      ),
    ]);
    return {
      doc,
      warnings: violations.filter((v) => v.severity === "warning"),
      // Soft: a day the catalogue cannot fill, or can fill only with museums
      // and stages, is still a day. Asked about once, of the model; never a
      // reason to throw the plan away.
      idle: [
        ...idleGaps(doc, c.dayEnds),
        ...museumHeavy(plan, places, c),
        ...misplaced(plan, places, c),
      ].map((g) => g.message),
      problems: [
        ...problems.map((p) => `${p.day}: ${p.message}`),
        ...errors.map((v) => `${v.day}: ${v.message}`),
        ...empty,
        ...routeProblems(plan, c.places, places),
      ],
      offending,
    };
  };

  const timed = async <T>(fn: () => Promise<T> | T) => {
    const t0 = performance.now();
    const value = await fn();
    return { value, ms: Math.round(performance.now() - t0) };
  };

  // 1. Warm-start cache. A hit is re-timed for these dates and re-validated.
  const key = cacheKey(c);
  const cached = await deps.cache.get(key);
  if (cached) {
    const { value: result, ms } = await timed(() => evaluate(cached));
    // A plan cached before days were checked for holes is one: re-composed.
    const ok = result.problems.length === 0 && result.idle.length === 0;
    attempts.push({
      source: "cache",
      ok,
      invented: [],
      problems: [...result.problems, ...result.idle],
      ms,
    });
    if (ok) {
      return {
        ok,
        source: "cache",
        doc: result.doc,
        plan: cached,
        warnings: result.warnings,
        attempts,
      };
    }
    await deps.cache.drop(key);
  }

  // 2. The model, then one retry with its rejection as feedback.
  const { sorted, toId } = candidateRefs(deps.candidates);
  const centre: LonLat = sorted.length
    ? [
        sorted.reduce((s, p) => s + p.lonLat[0], 0) / sorted.length,
        sorted.reduce((s, p) => s + p.lonLat[1], 0) / sorted.length,
      ]
    : [44.79, 41.72];
  const limits = dayLimits(c, deps.travel);
  const input: ComposeInput = {
    constraints: c,
    candidates: sorted.map((p, i) => ({
      ref: `p${i + 1}`,
      name: p.name,
      category: p.category,
      group: p.group,
      lonLat: p.lonLat,
      outdoor: p.outdoor,
      area: p.area,
      areas: p.areas,
      hours: deps.describeHours(p),
    })),
    days: Array.from({ length: c.days }, (_, i) => {
      const date = addDays(c.startDate, i);
      const sun = sunWindow(date, centre, CIVIL);
      return {
        day: i + 1,
        date,
        weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
          weekday: "long",
          timeZone: "UTC",
        }),
        dawn: sun ? localHhmm(sun.rise) : "",
        dusk: sun ? localHhmm(sun.set) : "",
        ...(i === 0 ? { arrives: limits.arrives } : {}),
        ...(i === c.days - 1 ? { leavesBy: limits.leavesBy } : {}),
      };
    }),
  };

  let feedback: ComposeFeedback | undefined;
  /** A plan that is valid but leaves holes in its days: kept, in case the retry does no better. */
  let sparse:
    | { source: Source; plan: Plan; result: ReturnType<typeof evaluate> }
    | undefined;
  for (const source of ["model", "retry"] as const) {
    const t0 = performance.now();
    let refPlan: RefPlan;
    try {
      refPlan = await deps.compose(input, feedback);
    } catch (error) {
      attempts.push({
        source,
        ok: false,
        invented: [],
        problems: [],
        error: (error as Error).message,
        ms: Math.round(performance.now() - t0),
      });
      continue;
    }

    const { plan, invented } = resolveRefs(refPlan, toId);
    const result = invented.length === 0 ? evaluate(plan) : undefined;
    const problems = result?.problems ?? [];
    const idle = result?.idle ?? [];
    const ok = invented.length === 0 && problems.length === 0;
    attempts.push({
      source,
      ok: ok && idle.length === 0,
      invented,
      problems: [...problems, ...idle],
      ms: Math.round(performance.now() - t0),
    });
    if (ok && result && idle.length === 0) {
      await deps.cache.put(key, plan);
      return {
        ok,
        source,
        doc: result.doc,
        plan,
        warnings: result.warnings,
        attempts,
      };
    }
    if (ok && result) {
      if (!sparse || idle.length < sparse.result.idle.length) {
        sparse = { source, plan, result };
      }
      feedback = { previous: refPlan, invented, problems: idle };
      continue;
    }
    feedback = { previous: refPlan, invented, problems };
  }

  // Two goes at a fuller day did not get one. Still a valid trip, and a better
  // one than the template's: it is what the traveller gets, and it is not
  // cached, so the next request tries again.
  if (sparse) {
    return {
      ok: true,
      source: sparse.source,
      doc: sparse.result.doc,
      plan: sparse.plan,
      warnings: sparse.result.warnings,
      attempts,
    };
  }

  // 3. The fallback: drop whatever it tripped on and try again.
  const exclude = new Set<string>();
  for (let round = 0; round < MAX_FALLBACK_ROUNDS; round++) {
    const { value, ms } = await timed(() => {
      const plan = fallbackPlan(c, deps.candidates, exclude);
      return { plan, result: evaluate(plan) };
    });
    const { plan, result } = value;
    const ok = result.problems.length === 0;
    attempts.push({
      source: "template",
      ok,
      invented: [],
      problems: result.problems,
      ms,
    });
    if (ok) {
      return {
        ok,
        source: "template",
        doc: result.doc,
        plan,
        warnings: result.warnings,
        attempts,
      };
    }
    const before = exclude.size;
    for (const id of result.offending) exclude.add(id);
    if (exclude.size === before) break; // nothing left to drop
  }

  return {
    ok: false,
    reason: "insufficient-coverage",
    attempts,
    uncovered: [],
  };
}
