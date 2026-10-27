import { z } from "zod";
import type { Constraints } from "@/domain/trip/generate/constraints";
import {
  INTAKE_MAX_TURNS,
  intakeMessage,
  intakeOption,
  intakeState,
  OPTIONS_MAX,
} from "@/domain/trip/generate/intake";

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

/**
 * The conversation on /new as the tab keeps it. Read back through this schema,
 * never cast: storage is anyone's to write, and a conversation kept by an
 * older page is either still valid or started afresh.
 */
export const conversation = z.object({
  messages: z.array(intakeMessage).max(INTAKE_MAX_TURNS * 2),
  state: intakeState,
  /** The planner has nothing left to ask. */
  ready: z.boolean(),
  /** Places asked for that no trip can go to: the trip is red while any stand. */
  unsupported: z.array(z.string().max(80)).max(5).optional(),
  /** One-tap answers to the planner's latest question. */
  suggestions: z.array(z.string().max(40)).max(4).optional(),
  /** The ways the trip could go that the planner's latest message offers. */
  options: z.array(intakeOption).max(OPTIONS_MAX).optional(),
});
export type Conversation = z.infer<typeof conversation>;

/** One turn from POST /api/trips/intake, checked before the page shows any of it. */
export const turnReply = z.object({
  ok: z.literal(true),
  reply: z.string().min(1),
  state: intakeState,
  ready: z.boolean(),
  unsupported: z.array(z.string()),
  suggestions: z.array(z.string()),
  options: z.array(intakeOption).default([]),
});
export type TurnReply = z.infer<typeof turnReply>;

/** The conversation became a trip: the next visit to /new starts a new one. */
export function forgetConversation() {
  try {
    sessionStorage.removeItem(PLANNER_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked): nothing to forget.
  }
}
