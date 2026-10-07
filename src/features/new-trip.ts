import type { Constraints } from "@/domain/trip/generate/constraints";

// What the landing page, /new and /new/building share in the browser.

/** Sentences to start from, on the landing page's prompt and on /new. */
export const composerExamples = [
  "7 days in Georgia, €700, nature and monasteries",
  "Long weekend in Kakheti with my partner",
  "Four days walking in Svaneti, moderate pace",
];

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
