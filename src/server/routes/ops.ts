import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { recordAudit } from "@/bll/audit.ts";
import { AUDIT_REASONS } from "@/domain/watch/kill-criteria.ts";
import { curatorEmails } from "@/lib/curator";
import { requireCurator, type SessionEnv } from "../auth.ts";

// The operator's side of the kill-criteria dashboard (src/app/ops). The page
// reads through a use case; the one thing it writes is an audit mark.
export const ops = new Hono<SessionEnv>().use(requireCurator).post(
  "/audits",
  zValidator(
    "json",
    z.object({
      matchId: z.uuid(),
      correct: z.boolean(),
      reason: z.enum(AUDIT_REASONS).optional(),
      note: z.string().max(500).optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const result = await recordAudit(
      { ...body, auditor: c.get("userId") },
      curatorEmails(),
    );
    if (result.ok) return c.json({ ok: true as const });
    return result.reason === "gone"
      ? c.json({ error: "gone" }, 404)
      : result.reason === "already-audited"
        ? c.json({ error: "already audited" }, 409)
        : c.json({ error: "a wrong verdict needs a reason" }, 400);
  },
);
