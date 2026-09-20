import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  type AppendFailure,
  type AppendSuccess,
  appendPatch,
  createTrip,
  docAt,
  history,
  previewPatch,
  restoreTo,
  tripView,
  undoLast,
} from "@/bll/trip-document.ts";
import { generateTrip } from "@/bll/trip-generation.ts";
import { tripHeader } from "@/domain/trip/document.ts";
import { constraints } from "@/domain/trip/generate/constraints.ts";
import { patchOps } from "@/domain/trip/patch.ts";
import { requireSession, type SessionEnv, tripAccess } from "../auth.ts";

// The trip document over HTTP. The work is done in src/bll/*; these handlers do
// validation, status codes and nothing else.

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

export const trips = new Hono<SessionEnv>()
  .use(requireSession)

  .post("/", zValidator("json", z.object({ trip: tripHeader })), async (c) =>
    c.json(
      { id: await createTrip(c.req.valid("json").trip, c.get("userId")) },
      201,
    ),
  )

  // Constraints in, a validated trip out (src/bll/trip-generation.ts).
  .post("/generate", zValidator("json", constraints), async (c) => {
    const result = await generateTrip(c.req.valid("json"), c.get("userId"));

    if (!result.ok) {
      if (result.reason === "rejected") {
        const { body, status } = failure(result.failure);
        return c.json(body, status);
      }
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

    return c.json(
      {
        id: result.tripId,
        source: result.source,
        head: result.head,
        doc: result.doc,
        warnings: result.warnings,
      },
      201,
    );
  })

  .get("/:id", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const access = await tripAccess(id, c.get("userId"));
    if (!access.ok) return c.json(access.body, access.status);

    const view = await tripView(id);
    return view ? c.json(view) : c.json({ error: "not found" }, 404);
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
      const access = await tripAccess(id, c.get("userId"));
      if (!access.ok) return c.json(access.body, access.status);

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
      const access = await tripAccess(id, c.get("userId"));
      if (!access.ok) return c.json(access.body, access.status);

      const result = await previewPatch(id, c.req.valid("json").ops);
      if (!result) return c.json({ error: "not found" }, 404);
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
    const access = await tripAccess(id, c.get("userId"));
    if (!access.ok) return c.json(access.body, access.status);
    return c.json({
      head: access.trip.headPatchId,
      patches: await history(id),
    });
  })

  .get(
    "/:id/patches/:patchId",
    zValidator("param", params.extend({ patchId: z.uuid() })),
    async (c) => {
      const { id, patchId } = c.req.valid("param");
      const access = await tripAccess(id, c.get("userId"));
      if (!access.ok) return c.json(access.body, access.status);
      const doc = await docAt(id, patchId);
      return doc ? c.json({ doc }) : c.json({ error: "not found" }, 404);
    },
  )

  .post("/:id/undo", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const access = await tripAccess(id, c.get("userId"));
    if (!access.ok) return c.json(access.body, access.status);

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
      const access = await tripAccess(id, c.get("userId"));
      if (!access.ok) return c.json(access.body, access.status);

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
