import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { categoryGroups } from "@/core/catalogue/categories";
import {
  addPlace,
  getProgress,
  getQueue,
  reviewPlace,
} from "@/core/catalogue/curation";
import { focusAreaSlugs } from "@/core/catalogue/focus-areas";
import { placeInput, reviewInput } from "@/core/catalogue/review-input";
import { getAuth } from "@/lib/auth";
import { isCurator } from "@/lib/curator";

type Env = { Variables: { userId: string } };

const groups = Object.keys(categoryGroups) as [
  keyof typeof categoryGroups,
  ...(keyof typeof categoryGroups)[],
];

export const curation = new Hono<Env>()
  .use(async (c, next) => {
    const session = await getAuth().api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session) return c.json({ error: "unauthenticated" }, 401);
    if (!isCurator(session.user)) return c.json({ error: "forbidden" }, 403);
    c.set("userId", session.user.id);
    await next();
  })
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
