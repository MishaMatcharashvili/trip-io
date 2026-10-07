import type { Constraints } from "@/domain/trip/generate/constraints";

// What /new and /new/building pass between them in the browser.

/** Constraints as a URL-safe token for /new/building. */
export function encodeConstraints(c: Constraints): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(c))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Where the conversation on /new is kept for the tab, so leaving the build returns to it. */
export const PLANNER_STORAGE_KEY = "trip.new.v1";

/** The conversation became a trip: the next visit to /new starts a new one. */
export function forgetConversation() {
  try {
    sessionStorage.removeItem(PLANNER_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked): nothing to forget.
  }
}
