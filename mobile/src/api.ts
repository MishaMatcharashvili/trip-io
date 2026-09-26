import { hc } from "hono/client";
// Type-only: the server's routes shape this client, but no server code is
// bundled into the app.
import type { AppType } from "@/server/app";

const baseUrl = process.env.EXPO_PUBLIC_API_URL;

/**
 * The typed API client, or null in a build made without EXPO_PUBLIC_API_URL.
 * Null rather than a throw: this module loads before the first screen, and a
 * throw here is a crash at launch with nothing on screen to say why.
 */
export const api = baseUrl ? hc<AppType>(baseUrl) : null;
