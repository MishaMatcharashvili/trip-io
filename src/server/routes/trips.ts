import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import {
  type AppendFailure,
  type AppendSuccess,
  accessTrip,
  appendPatch,
  createTrip,
  docAt,
  duplicateTrip,
  history,
  previewPatch,
  restoreTo,
  tripView,
  undoLast,
} from "@/bll/trip-document.ts";
import { generateTrip } from "@/bll/trip-generation.ts";
import { itineraryFile } from "@/bll/trip-screen.ts";
import { demoCheckout, offerFor, startFreeWatch } from "@/bll/watch-pass.ts";
import { updateWatchSettings } from "@/bll/watch-settings.ts";
import { tripHeader } from "@/domain/trip/document.ts";
import { constraints } from "@/domain/trip/generate/constraints.ts";
import { patchOps } from "@/domain/trip/patch.ts";
import { CLOCK_TIME, channels } from "@/domain/watch/settings.ts";
import { requireSession, type SessionEnv } from "../auth.ts";

// The trip document over HTTP. The work is done in src/bll/*; these handlers do
// validation, status codes and nothing else.

const params = z.object({ id: z.uuid() });

const clockTime = z.string().regex(CLOCK_TIME, "expected HH:MM");

/** What a traveller may change about how a trip's watch reaches them. */
const watchSettings = z
  .object({
    channels: z.array(z.enum(channels)).max(channels.length).optional(),
    // Null switches quiet hours off: an answer, not a missing value.
    quietHours: z
      .object({ start: clockTime, end: clockTime })
      .nullable()
      .optional(),
  })
  .refine((s) => s.channels !== undefined || s.quietHours !== undefined, {
    message: "nothing to change",
  });

/** Why a trip is off limits, as the status code the client acts on. */
const denied = (c: Context, reason: "not-found" | "forbidden") =>
  reason === "not-found"
    ? c.json({ error: "not found" as const }, 404)
    : c.json({ error: "forbidden" as const }, 403);

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
    const access = await accessTrip(id, c.get("userId"));
    if (!access.ok) return denied(c, access.reason);

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
      const access = await accessTrip(id, c.get("userId"));
      if (!access.ok) return denied(c, access.reason);

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
      const access = await accessTrip(id, c.get("userId"));
      if (!access.ok) return denied(c, access.reason);

      const result = await previewPatch(id, c.req.valid("json").ops);
      if (!result) return c.json({ error: "not found" }, 404);
      if (result.ok) {
        return c.json({
          ok: true as const,
          violations: result.violations,
          introduced: result.introduced,
        });
      }
      // A PatchError is an Error, whose `message` is not enumerable: passed
      // through as-is it serialises without the one field that says what
      // went wrong.
      if (result.kind === "patch") {
        const { code, path, message } = result.error;
        return c.json({
          ok: false as const,
          kind: "patch" as const,
          error: { code, path, message },
        });
      }
      return c.json(result);
    },
  )

  // Channels and quiet hours. Push switched off mid-trip is recorded as a mute
  // (src/bll/watch-settings.ts) — a kill criterion, not just a preference.
  .patch(
    "/:id/watch",
    zValidator("param", params),
    zValidator("json", watchSettings),
    async (c) => {
      const { id } = c.req.valid("param");
      const access = await accessTrip(id, c.get("userId"));
      if (!access.ok) return denied(c, access.reason);

      const body = c.req.valid("json");
      const saved = await updateWatchSettings(id, {
        channels: body.channels ? [...new Set(body.channels)] : undefined,
        quietHours: body.quietHours,
      });
      // A trip with no stops has no watch yet: nothing to be reached about.
      return saved ? c.body(null, 204) : c.json({ error: "not watched" }, 409);
    },
  )

  // The paywall. Planning is free; watching is bought per trip, the first free.
  .get("/:id/pass", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const access = await accessTrip(id, c.get("userId"));
    if (!access.ok) return denied(c, access.reason);
    return c.json({ offer: await offerFor(id, c.get("userId")) });
  })

  .post("/:id/pass", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const access = await accessTrip(id, c.get("userId"));
    if (!access.ok) return denied(c, access.reason);
    const result = await startFreeWatch(id, c.get("userId"));
    return result.ok
      ? c.json(result, 201)
      : c.json(
          { error: result.reason },
          result.reason === "payment-required" ? 402 : 409,
        );
  })

  // Stand-in checkout until Flitt: records a paid pass, charges nobody.
  .post("/:id/pass/checkout", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const access = await accessTrip(id, c.get("userId"));
    if (!access.ok) return denied(c, access.reason);
    const result = await demoCheckout(id, c.get("userId"));
    return result.ok
      ? c.json(result, 201)
      : c.json({ error: result.reason }, 409);
  })

  // "Plan it again": the same stops on new dates, as a new trip.
  .post(
    "/:id/duplicate",
    zValidator("param", params),
    zValidator("json", z.object({ startDate: z.iso.date() })),
    async (c) => {
      const { id } = c.req.valid("param");
      const access = await accessTrip(id, c.get("userId"));
      if (!access.ok) return denied(c, access.reason);

      const result = await duplicateTrip(
        id,
        c.get("userId"),
        c.req.valid("json").startDate,
      );
      if (!result.ok) {
        const { body, status } = failure(result);
        return c.json(body, status);
      }
      return c.json({ id: result.tripId }, 201);
    },
  )

  // The itinerary for a calendar app. Downloaded, so it carries a file name.
  .get("/:id/itinerary.ics", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const access = await accessTrip(id, c.get("userId"));
    if (!access.ok) return denied(c, access.reason);

    const file = await itineraryFile(id);
    if (!file) return c.json({ error: "not found" }, 404);
    return c.body(file, 200, {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="trip-${id.slice(0, 8)}.ics"`,
    });
  })

  .get("/:id/patches", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const access = await accessTrip(id, c.get("userId"));
    if (!access.ok) return denied(c, access.reason);
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
      const access = await accessTrip(id, c.get("userId"));
      if (!access.ok) return denied(c, access.reason);
      const doc = await docAt(id, patchId);
      return doc ? c.json({ doc }) : c.json({ error: "not found" }, 404);
    },
  )

  .post("/:id/undo", zValidator("param", params), async (c) => {
    const { id } = c.req.valid("param");
    const access = await accessTrip(id, c.get("userId"));
    if (!access.ok) return denied(c, access.reason);

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
      const access = await accessTrip(id, c.get("userId"));
      if (!access.ok) return denied(c, access.reason);

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
