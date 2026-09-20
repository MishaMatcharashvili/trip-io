import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { addPlace, getProgress, getQueue, reviewPlace } from "@/bll/curation";
import { categoryGroups } from "@/domain/catalogue/categories";
import { focusAreaSlugs } from "@/domain/catalogue/focus-areas";
import { placeInput, reviewInput } from "@/domain/catalogue/review-input";
import { requireCurator, type SessionEnv } from "../auth.ts";

const groups = Object.keys(categoryGroups) as [
  keyof typeof categoryGroups,
  ...(keyof typeof categoryGroups)[],
];

export const curation = new Hono<SessionEnv>()
  .use(requireCurator)
  .get("/progress", async (c) => c.json({ areas: await getProgress() }))
  .get(
    "/queue",
    zValidator(
      "query",
      z.object({
        area: z.enum(focusAreaSlugs),
        group: z.enum(groups).optional(),
      }),
    ),
    async (c) => c.json(await getQueue(c.req.valid("query"))),
  )
  .post(
    "/places/:id/review",
    zValidator("param", z.object({ id: z.uuid() })),
    zValidator("json", reviewInput),
    async (c) => {
      const found = await reviewPlace(
        c.req.valid("param").id,
        c.req.valid("json"),
        c.get("userId"),
      );
      return found
        ? c.json({ ok: true as const })
        : c.json({ error: "not found" }, 404);
    },
  )
  .post("/places", zValidator("json", placeInput), async (c) =>
    c.json({ id: await addPlace(c.req.valid("json"), c.get("userId")) }, 201),
  );
