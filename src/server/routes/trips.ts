import { randomUUID } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "@/dal/client";
import { tripHeader } from "@/domain/trip/document.ts";
import { planCache } from "@/domain/trip/generate/cache.ts";
import {
  CANDIDATE_LIMIT,
  describeHours,
  loadCandidates,
} from "@/domain/trip/generate/candidates.ts";
import { composeWithGemini } from "@/domain/trip/generate/compose.ts";
import { constraints } from "@/domain/trip/generate/constraints.ts";
import {
  generate,
  tripHeader as headerFor,
} from "@/domain/trip/generate/pipeline.ts";
import { recordGeneration } from "@/domain/trip/generate/record.ts";
import { patchOps } from "@/domain/trip/patch.ts";
import {
  type AppendFailure,
  type AppendSuccess,
  addAllOps,
  appendPatch,
  createTrip,
  docAt,
  loadPlaces,
  loadTrip,
  patchHistory,
  restoreTo,
  undoLast,
} from "@/domain/trip/store.ts";
import { straightLineTravel } from "@/domain/trip/travel.ts";
import { validateDoc, validateProposal } from "@/domain/trip/validate.ts";
import { getAuth } from "@/lib/auth";

// The trip document over HTTP. Business logic lives in src/domain/trip/*; these
// handlers do auth, ownership and status codes.
//
// Anonymous sessions count: a visitor plans a trip before there is an account
// (context/architecture.md), and Better Auth's onLinkAccount hands the trip over
// when they sign up.

type Env = { Variables: { userId: string } };

const params = z.object({ id: z.uuid() });

/** Failures from the store, as the status codes the client acts on. */
const failure = (result: AppendFailure) => {
  switch (result.code) {
    case "not-found":
      return { body: { error: "not found" as const }, status: 404 } as const;
    case "stale":
      // The client patched against a head that has moved: refetch, don't merge.
      return {
        body: { error: "stale" as const, headPatchId: result.headPatchId },
        status: 409,
      } as const;
    case "invalid":
      return {
        body: { error: "invalid ops" as const, issues: result.issues },
        status: 422,
      } as const;
    case "patch":
      return {
        body: { error: "patch failed" as const, message: result.message },
        status: 422,
      } as const;
    case "violations":
      return {
        body: {
          error: "would break the day" as const,
          blocking: result.blocking,
          violations: result.violations,
        },
        status: 422,
      } as const;
  }
};

const applied = (result: AppendSuccess) => ({
  head: result.patchId,
  seq: result.seq,
  doc: result.doc,
  warnings: result.introduced,
  violations: result.violations,
});

export const trips = new Hono<Env>()
  .use(async (c, next) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    c.set("userId", session.user.id);
    await next();
  })

  .post("/", zValidator("json", z.object({ trip: tripHeader })), async (c) =>
    c.json(
      { id: await createTrip(c.req.valid("json").trip, c.get("userId")) },
      201,
    ),
  )

  // Constraints in, a validated trip out. Runs the model inline: a plan takes
  // tens of seconds, and there is no job queue until Phase 3.
  .post("/generate", zValidator("json", constraints), async (c) => {
    const wanted = c.req.valid("json");
    const candidates = await loadCandidates(wanted.areas, CANDIDATE_LIMIT);

    const result = await generate(wanted, {
      compose: composeWithGemini,
      cache: planCache,
      candidates,
      travel: straightLineTravel,
      newId: randomUUID,
      describeHours,
    });

    if (!result.ok) {
      await recordGeneration(null, wanted, "failed", result.attempts);
      return c.json(
        {
          error: "insufficient-coverage" as const,
          message:
            "There aren't enough hand-verified places in those areas yet to build a trip.",
          attempts: result.attempts,
        },
        422,
      );
    }

    const userId = c.get("userId");
    const tripId = await createTrip(headerFor(wanted), userId);
    await recordGeneration(tripId, wanted, result.source, result.attempts);

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
    if (!written.ok) {
      const { body, status } = failure(written);
      return c.json(body, status);
    }

    return c.json(
      {
        id: tripId,
        source: result.source,
        head: written.patchId,
        doc: written.doc,
        warnings: written.violations,
      },
      201,
    );
  })

  .get("/:id", zValidator("param", params), async (c) => {
    const trip = await loadTrip(db, c.req.valid("param").id);
    if (!trip) return c.json({ error: "not found" }, 404);
    if (trip.userId !== c.get("userId"))
      return c.json({ error: "forbidden" }, 403);

    const places = await loadPlaces(
      db,
      Object.values(trip.doc.nodes)
        .map((n) => n.placeId)
        .filter((id): id is string => id !== null),
    );
    return c.json({
      doc: trip.doc,
      head: trip.headPatchId,
      seq: trip.seq,
      violations: validateDoc(trip.doc, {
        places,
        travel: straightLineTravel,
        author: "user",
      }),
    });
  })

  .post(
    "/:id/patches",
    zValidator("param", params),
    zValidator(
      "json",
      z.object({
        parentId: z.uuid().nullable(),
        intent: z.string().min(1).max(200),
        ops: patchOps,
        clientSeq: z.number().int().optional(),
      }),
    ),
    async (c) => {
      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const trip = await loadTrip(db, id);
      if (!trip) return c.json({ error: "not found" }, 404);
      if (trip.userId !== c.get("userId"))
        return c.json({ error: "forbidden" }, 403);

      const result = await appendPatch({
        tripId: id,
        parentId: body.parentId,
        intent: body.intent,
        ops: body.ops,
        author: "user",
        acceptedBy: c.get("userId"),
        clientSeq: body.clientSeq ?? null,
      });
      if (!result.ok) {
        const { body: error, status } = failure(result);
        return c.json(error, status);
      }
      return c.json(applied(result));
    },
  )

  // A dry run of the same check: the replan preview now, the intervention diff
  // in Phase 5. Changes nothing.
  .post(
    "/:id/validate",
    zValidator("param", params),
    zValidator("json", z.object({ ops: patchOps })),
    async (c) => {
      const { id } = c.req.valid("param");
      const trip = await loadTrip(db, id);
      if (!trip) return c.json({ error: "not found" }, 404);
      if (trip.userId !== c.get("userId"))
        return c.json({ error: "forbidden" }, 403);

      const places = await loadPlaces(db, [
        ...Object.values(trip.doc.nodes)
          .map((n) => n.placeId)
          .filter((v): v is string => v !== null),
        ...c.req
          .valid("json")
          .ops.flatMap((op) =>
            op.op === "add" && typeof op.value.placeId === "string"
              ? [op.value.placeId]
              : [],
          ),
      ]);
      const result = validateProposal(trip.doc, c.req.valid("json").ops, {
        places,
        travel: straightLineTravel,
        author: "user",
      });
      return c.json(
        result.ok
          ? {
              ok: true as const,
              violations: result.violations,
              introduced: result.introduced,
            }
          : result,
      );
    },
  )

  .get("/:id/patches", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const trip = await loadTrip(db, id);
    if (!trip) return c.json({ error: "not found" }, 404);
    if (trip.userId !== c.get("userId"))
      return c.json({ error: "forbidden" }, 403);
    return c.json({
      head: trip.headPatchId,
      patches: await patchHistory(db, id),
    });
  })

  .get(
    "/:id/patches/:patchId",
    zValidator("param", params.extend({ patchId: z.uuid() })),
    async (c) => {
      const { id, patchId } = c.req.valid("param");
      const trip = await loadTrip(db, id);
      if (!trip) return c.json({ error: "not found" }, 404);
      if (trip.userId !== c.get("userId"))
        return c.json({ error: "forbidden" }, 403);
      const doc = await docAt(db, id, patchId);
      return doc ? c.json({ doc }) : c.json({ error: "not found" }, 404);
    },
  )

  .post("/:id/undo", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const trip = await loadTrip(db, id);
    if (!trip) return c.json({ error: "not found" }, 404);
    if (trip.userId !== c.get("userId"))
      return c.json({ error: "forbidden" }, 403);

    const result = await undoLast(id, c.get("userId"));
    if (!result.ok) {
      if (result.code === "nothing-to-undo") {
        return c.json({ error: "nothing to undo" }, 409);
      }
      const { body, status } = failure(result);
      return c.json(body, status);
    }
    return c.json(applied(result));
  })

  .post(
    "/:id/restore",
    zValidator("param", params),
    zValidator("json", z.object({ patchId: z.uuid() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const trip = await loadTrip(db, id);
      if (!trip) return c.json({ error: "not found" }, 404);
      if (trip.userId !== c.get("userId"))
        return c.json({ error: "forbidden" }, 403);

      const result = await restoreTo(
        id,
        c.req.valid("json").patchId,
        c.get("userId"),
      );
      if (!result.ok) {
        if (result.code === "no-such-patch") {
          return c.json({ error: "not found" }, 404);
        }
        if (result.code === "no-change") {
          // Already that version: nothing to append, nothing to report.
          return c.json({ head: result.headPatchId, changed: false });
        }
        const { body, status } = failure(result);
        return c.json(body, status);
      }
      return c.json(applied(result));
    },
  );
