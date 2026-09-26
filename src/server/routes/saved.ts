import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { forgetPlace, keepPlace, savedPlaceIds } from "@/bll/saved";
import { requireSession, type SessionEnv } from "../auth.ts";

// A traveller's kept places. Anonymous sessions may save too; the places move
// to the account when one is made (src/dal/trips.ts, reassignTrips).

const params = z.object({ placeId: z.uuid() });

export const saved = new Hono<SessionEnv>()
  .use(requireSession)
  .get("/", async (c) =>
    c.json({ placeIds: await savedPlaceIds(c.get("userId")) }),
  )
  .put("/places/:placeId", zValidator("param", params), async (c) => {
    const kept = await keepPlace(c.get("userId"), c.req.valid("param").placeId);
    return kept ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  })
  .delete("/places/:placeId", zValidator("param", params), async (c) => {
    await forgetPlace(c.get("userId"), c.req.valid("param").placeId);
    return c.body(null, 204);
  });
