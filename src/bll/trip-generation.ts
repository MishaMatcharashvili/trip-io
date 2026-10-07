import { randomUUID } from "node:crypto";
import { candidatesInArea } from "../dal/places.ts";
import {
  cancelRequest,
  claimRequest,
  finishRequest,
  planCache,
  recordGeneration,
  releaseRequest,
  requestState,
} from "../dal/plans.ts";
import type { FocusAreaSlug } from "../domain/catalogue/focus-areas.ts";
import type { TripDoc } from "../domain/trip/document.ts";
import { cacheKey } from "../domain/trip/generate/cache-key.ts";
import {
  CANDIDATE_LIMIT,
  CANDIDATES_PER_AREA_MIN,
  describeHours,
} from "../domain/trip/generate/candidates.ts";
import type { Constraints } from "../domain/trip/generate/constraints.ts";
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
  | { ok: false; reason: "rejected"; failure: AppendFailure }
  /** The traveller called it off while it was being composed: nothing was written. */
  | { ok: false; reason: "cancelled" };

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
  {
    compose = composeWithOpenAI,
    stillWanted = async () => true,
  }: {
    compose?: Composer;
    /** Asked once the plan is ready and before anything is written. */
    stillWanted?: () => Promise<boolean>;
  } = {},
): Promise<GeneratedTrip | GenerationFailure> {
  const key = cacheKey(wanted);
  const result = await generate(wanted, {
    compose,
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

  if (!(await stillWanted())) {
    await recordGeneration(null, key, "cancelled", result.attempts);
    return { ok: false, reason: "cancelled" };
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

export type BuildOutcome =
  | { kind: "built"; trip: GeneratedTrip }
  /** This request was built before: the same trip, not another. */
  | { kind: "existing"; tripId: string }
  /** Another call holds this request and is still composing. */
  | { kind: "in-progress" }
  | { kind: "cancelled" }
  | {
      kind: "failed";
      failure: Exclude<GenerationFailure, { reason: "cancelled" }>;
    };

export type BuildDeps = {
  claim: typeof claimRequest;
  finish: typeof finishRequest;
  release: typeof releaseRequest;
  state: typeof requestState;
  generate: typeof generateTrip;
};

/**
 * `generateTrip`, at most once per request id. The browser mints the id when
 * the traveller asks for the build, so a reload, the back button or a second
 * tab asks for the same build: the first call composes it and the rest are told
 * where it stands. A failed build releases the id, so trying again works.
 */
export async function buildTripOnce(
  requestId: string,
  wanted: Constraints,
  userId: string,
  overrides: Partial<BuildDeps> = {},
): Promise<BuildOutcome> {
  const deps: BuildDeps = {
    claim: claimRequest,
    finish: finishRequest,
    release: releaseRequest,
    state: requestState,
    generate: generateTrip,
    ...overrides,
  };

  const claim = await deps.claim(requestId, userId);
  if (claim.status === "done")
    return { kind: "existing", tripId: claim.tripId };
  if (claim.status === "pending") return { kind: "in-progress" };
  if (claim.status === "cancelled") return { kind: "cancelled" };

  let result: Awaited<ReturnType<typeof generateTrip>>;
  try {
    result = await deps.generate(wanted, userId, {
      stillWanted: async () =>
        (await deps.state(requestId, userId))?.status === "pending",
    });
  } catch (error) {
    await deps.release(requestId);
    throw error;
  }

  if (result.ok) {
    await deps.finish(requestId, result.tripId);
    return { kind: "built", trip: result };
  }
  if (result.reason === "cancelled") return { kind: "cancelled" };
  await deps.release(requestId);
  return { kind: "failed", failure: result };
}

/** Where one of the traveller's build requests stands, or null if they have none by that id. */
export const buildState = (requestId: string, userId: string) =>
  requestState(requestId, userId);

/** Calls a build off. False when it had already finished: the trip exists. */
export const cancelBuild = (requestId: string, userId: string) =>
  cancelRequest(requestId, userId);
