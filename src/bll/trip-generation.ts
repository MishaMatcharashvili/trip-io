import { randomUUID } from "node:crypto";
import { candidatesInArea } from "../dal/places.ts";
import { planCache, recordGeneration } from "../dal/plans.ts";
import type { FocusAreaSlug } from "../domain/catalogue/focus-areas.ts";
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
import {
  type Attempt,
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
 * Places across the requested areas — curated first, verified filling in —
 * spread evenly so one dense area can't crowd the others out of the prompt. A place on the boundary of two areas
 * comes back once, under the first.
 */
export async function loadCandidates(
  areas: readonly FocusAreaSlug[],
  limit = CANDIDATE_LIMIT,
): Promise<Candidate[]> {
  const perArea = Math.max(
    CANDIDATES_PER_AREA_MIN,
    Math.ceil(limit / Math.max(1, areas.length)),
  );
  const perAreaResults = await Promise.all(
    areas.map((slug) => candidatesInArea(slug, perArea)),
  );

  const seen = new Set<string>();
  return perAreaResults.flat().filter((c) => !seen.has(c.id) && seen.add(c.id));
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
  | { ok: false; reason: "insufficient-coverage"; attempts: Attempt[] }
  /** The plan validated on the way out and not on the way in: a bug, not an input problem. */
  | { ok: false; reason: "rejected"; failure: AppendFailure };

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
): Promise<GeneratedTrip | GenerationFailure> {
  const key = cacheKey(wanted);
  const result = await generate(wanted, {
    compose: composeWithOpenAI,
    cache: planCache,
    candidates: await loadCandidates(wanted.areas),
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
