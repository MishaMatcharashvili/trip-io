import { hc, parseResponse } from "hono/client";
// Type-only: the server's routes shape this client, but no server code is
// bundled into the app.
import type { AppType } from "@/server/app";
import { authClient } from "~/auth";
import { baseUrl } from "~/config";

/**
 * The typed API client, or null in a build made without EXPO_PUBLIC_API_URL.
 * Null rather than a throw: this module loads before the first screen, and a
 * throw here is a crash at launch with nothing on screen to say why.
 *
 * Every request carries the session cookie Better Auth keeps in the keychain.
 * It is attached by hand, with `credentials: "omit"`, because React Native's
 * own cookie jar is not the one the session lives in.
 */
export const api = baseUrl
  ? hc<AppType>(baseUrl, {
      headers: async (): Promise<Record<string, string>> => {
        const cookie = await authClient.getCookie();
        return cookie ? { Cookie: cookie } : {};
      },
      init: { credentials: "omit" },
    })
  : null;

/** The client, or an error a screen can show for a build with no API. */
export function client() {
  if (!api) {
    throw new Error("No API configured: EXPO_PUBLIC_API_URL is not set");
  }
  return api.api;
}

/**
 * The body of a response, typed by the route. Anything but a 2xx throws, and
 * `statusOf` says which.
 */
export { parseResponse as read };

/** The HTTP status a failed `read` carried, if it carried one. */
export function statusOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

/** The JSON body a failed `read` carried: the route's `{ error, … }`. */
export function bodyOf(
  error: unknown,
): { error?: string; messages?: string[] } | null {
  const data = (error as { detail?: { data?: unknown } } | null)?.detail?.data;
  return data && typeof data === "object" ? data : null;
}

/** What to tell the traveller about a failure. */
export function messageOf(error: unknown): string {
  const status = statusOf(error);
  if (status === 401) return "You have been signed out. Sign in again.";
  if (status === 403 || status === 404) return "That is not available.";
  if (status) return `Something went wrong on our side (${status}).`;
  if (error instanceof Error && error.message.startsWith("No API")) {
    return error.message;
  }
  return "Could not reach trip.io. Check your connection.";
}
