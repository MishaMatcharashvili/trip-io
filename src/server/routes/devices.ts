import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { registerDevice, unregisterDevice } from "@/bll/devices.ts";
import { EXPO_TOKEN } from "@/infra/expo-push.ts";
import { requireSession, type SessionEnv } from "../auth.ts";

// Push registration for the native shell (Phase 7). Validation and status
// codes only; src/bll/devices.ts does the rest.

const token = z.string().regex(EXPO_TOKEN, "not an Expo push token");

export const devices = new Hono<SessionEnv>()
  .use(requireSession)

  .post(
    "/",
    zValidator(
      "json",
      z.object({ token, platform: z.enum(["ios", "android"]) }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      await registerDevice(c.get("userId"), body.token, body.platform);
      return c.body(null, 204);
    },
  )

  .post("/unregister", zValidator("json", z.object({ token })), async (c) => {
    const found = await unregisterDevice(
      c.get("userId"),
      c.req.valid("json").token,
    );
    return found ? c.body(null, 204) : c.json({ error: "not found" }, 404);
  });
