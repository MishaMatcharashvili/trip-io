import { hc } from "hono/client";
// Type-only: the server's routes shape this client, but no server code is
// bundled into the app.
import type { AppType } from "@/server/app";

const baseUrl = process.env.EXPO_PUBLIC_API_URL;
if (!baseUrl) throw new Error("EXPO_PUBLIC_API_URL is not set");

export const api = hc<AppType>(baseUrl);
