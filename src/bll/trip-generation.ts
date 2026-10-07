import { randomUUID } from "node:crypto";
import { candidatesInArea } from "../dal/places.ts";
import { planCache, recordGeneration } from "../dal/plans.ts";
import {
  destination,
  destinationName,
} from "../domain/catalogue/destinations.ts";
import type { TripDoc } from "../domain/trip/document.ts";
import {
  CANDIDATE_LIMIT,
  CANDIDATES_PER_AREA_MIN,
  describeHours,
} from "../domain/trip/generate/candidates.ts";
import {
  type Constraints,
  cacheKey,
} from "../domain/trip/generate/constraints.ts";
import { assess, reasons } from "../domain/trip/generate/feasibility.ts";
import {
  type Attempt,
  type Composer,
  generate,
  type Source,
  tripHeader as tripHeaderFor,
} from "../domain/trip/generate/pipeline.ts";
import type { Candidate } from "../domain/trip/generate/plan.ts";
import { straightLineTravel } from "../domain/trip/travel.ts";
import type { Violation } from "../domain/trip/validate.ts";
import { composeWithOpenAI } from "../infra/openai-composer.ts";
import {
  type AppendFailure,
  addAllOps,
  appendPatch,
  createTrip,
} from "./trip-document.ts";

// Generating a trip: gather what the planner may choose from, run the pipeline,
// write the result. The pipeline itself is pure and lives in the domain; this is
// where it meets the catalogue and the log.

/**
 * Places across the requested destinations — curated first, verified filling
 * in — spread evenly so one dense destination can't crowd the others out of the
 * prompt. A place that lies in two of them (Telavi, when Kakheti was asked for
 * too) comes back once, and knows both.
 */
export async function loadCandidates(
  places: readonly string[],
  limit = CANDIDATE_LIMIT,
): Promise<Candidate[]> {
  // A round trip names its start twice; it is still one place to retrieve.
  const wanted = [...new Set(places)].flatMap(
    (slug) => destination(slug) ?? [],
  );
  const perArea = Math.max(
    CANDIDATES_PER_AREA_MIN,
    Math.ceil(limit / Math.max(1, wanted.length)),
  );
  const perAreaResults = await Promise.all(
    wanted.map((d) => candidatesInArea(d, perArea)),
  );

  const byId = new Map<string, Candidate>();
  for (const c of perAreaResults.flat()) {
    const known = byId.get(c.id);
    byId.set(
      c.id,
      known ? { ...known, areas: [...known.areas, ...c.areas] } : c,
    );
  }
  return [...byId.values()];
}

export type GeneratedTrip = {
  ok: true;
  tripId: string;
  source: Source;
  head: string;
  doc: TripDoc;
  /** Warnings only (pace, unknown hours); errors never get this far. */
  warnings: Violation[];
};

export type GenerationFailure =
  /** The request cannot be done, whatever places there are. No plan was attempted. */
  | { ok: false; reason: "impossible"; explanations: string[] }
  | {
      ok: false;
      reason: "insufficient-coverage";
      attempts: Attempt[];
      explanations: string[];
    }
  /** The plan validated on the way out and not on the way in: a bug, not an input problem. */
  | { ok: false; reason: "rejected"; failure: AppendFailure };

const listed = (names: string[]) =>
  names.length > 1
    ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
    : (names[0] ?? "");

/** Scheduler and validator problems carry their day; the route's do not. */
const DATED = /^\d{4}-\d\d-\d\d: /;

/**
 * Why no plan came out, for the traveller: which places have nothing to visit,
 * or what the last attempt could not fit. A failure is explained in terms of
 * what they asked for, never as "something went wrong".
 */
function explain(
  wanted: Constraints,
  failed: { attempts: Attempt[]; uncovered: string[] },
): string[] {
  if (failed.uncovered.length) {
    const names = listed(failed.uncovered.map(destinationName));
    return [
      `I don’t have checked places to visit in ${names} yet, so I can’t plan a day there. Take ${failed.uncovered.length === 1 ? "it" : "them"} out, or choose somewhere nearby.`,
    ];
  }
  const last = failed.attempts.findLast((a) => a.problems.length > 0);
  const route = last?.problems.filter((p) => !DATED.test(p)) ?? [];
  if (route.length) {
    return [
      `I couldn’t fit ${listed([...new Set(wanted.places)].map(destinationName))} into ${wanted.days} ${wanted.days === 1 ? "day" : "days"}: ${route.join("; ")}. Add a day, or take a place out.`,
    ];
  }
  const days = (last?.problems ?? [])
    .slice(0, 3)
    .map((p) => p.replace(DATED, ""));
  return [
    days.length
      ? `I couldn’t build days that hold together for this trip: ${days.join("; ")}. Try other dates or a slower pace.`
      : "There aren’t enough checked places for this trip yet. Try other places, or fewer days.",
  ];
}

/**
 * Constraints in, a saved trip out: retrieve candidates, run the pipeline, mint
 * the trip and write the plan as its first patch. Every outcome, success or
 * not, leaves a row in the generation log.
 *
 * The model runs inline — a plan takes tens of seconds, and there is no job
 * queue until Phase 3.
 */
export async function generateTrip(
  wanted: Constraints,
  userId: string | null,
  { compose = composeWithOpenAI }: { compose?: Composer } = {},
): Promise<GeneratedTrip | GenerationFailure> {
  const key = cacheKey(wanted);

  // The screen judged the request before sending it; this is the same
  // judgement again, because the screen is not what decides.
  const verdict = assess(wanted);
  if (!verdict.possible) {
    await recordGeneration(null, key, "failed", []);
    return { ok: false, reason: "impossible", explanations: reasons(verdict) };
  }

  const result = await generate(wanted, {
    compose,
    cache: planCache,
    candidates: await loadCandidates(wanted.places),
    travel: straightLineTravel,
    newId: randomUUID,
    describeHours,
  });

  if (!result.ok) {
    await recordGeneration(null, key, "failed", result.attempts);
    return {
      ok: false,
      reason: "insufficient-coverage",
      attempts: result.attempts,
      explanations: explain(wanted, result),
    };
  }

  const tripId = await createTrip(tripHeaderFor(wanted), userId);
  await recordGeneration(tripId, key, result.source, result.attempts);

  // The generated plan enters the log as its own patch, and is validated once
  // more on the way in — the store trusts nothing it didn't check itself.
  const written = await appendPatch({
    tripId,
    parentId: null,
    intent: "Generated plan",
    ops: addAllOps(result.doc),
    author: "system",
    meta: { source: result.source },
  });
  if (!written.ok) return { ok: false, reason: "rejected", failure: written };

  return {
    ok: true,
    tripId,
    source: result.source,
    head: written.patchId,
    doc: written.doc,
    warnings: written.violations,
  };
}
