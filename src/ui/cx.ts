/** Joins class names, dropping anything falsy. */
export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** The three jobs colour does, plus the neutral "nothing happening" tone. */
export type Tone = "neutral" | "agent" | "alert" | "ok" | "idle";
