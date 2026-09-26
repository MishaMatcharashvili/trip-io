import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  type AnswerResult,
  answerIntervention,
  answers,
  interventionCard,
} from "@/bll/interventions.ts";
import { requireSession, type SessionEnv } from "../auth.ts";

// The traveller's answer to an intervention, over HTTP — the same three buttons
// the web card and the native card both show. The work is in
// src/bll/interventions.ts; this maps outcomes to status codes.

const params = z.object({ id: z.uuid() });

/** Why an answer was not recorded, as the status the client acts on. */
const refused = (result: Exclude<AnswerResult, { ok: true }>) => {
  switch (result.reason) {
    case "not-found":
      return { body: { error: "not found" as const }, status: 404 } as const;
    case "forbidden":
      return { body: { error: "forbidden" as const }, status: 403 } as const;
    // Already answered from another device, or nothing left to apply. The
    // client refetches the card rather than retrying.
    case "already-answered":
    case "nothing-to-apply":
    case "no-longer-applies":
      return { body: { error: result.reason }, status: 409 } as const;
    case "would-break-the-day":
      return {
        body: { error: result.reason, messages: result.messages },
        status: 422,
      } as const;
  }
};

export const interventions = new Hono<SessionEnv>()
  .use(requireSession)

  .get("/:id", zValidator("param", params), async (c) => {
    const result = await interventionCard(
      c.req.valid("param").id,
      c.get("userId"),
    );
    if (result.ok) return c.json(result.card);
    return result.reason === "forbidden"
      ? c.json({ error: "forbidden" as const }, 403)
      : c.json({ error: "not found" as const }, 404);
  })

  // accept | dismiss | mute. Accept applies the offer's patch and records the
  // outcome in one transaction; the other two record it alone.
  .post(
    "/:id/:answer",
    zValidator("param", params.extend({ answer: z.enum(answers) })),
    async (c) => {
      const { id, answer } = c.req.valid("param");
      const result = await answerIntervention(id, c.get("userId"), answer);
      if (result.ok) return c.json(result);
      const { body, status } = refused(result);
      return c.json(body, status);
    },
  );
