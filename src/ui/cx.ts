import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only recognises Tailwind's default scale names. Our tokens
 * have to be declared or it misreads them — `text-mini` would be taken for a
 * colour and dropped next to `text-ink-faint`.
 */
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "mini", "small", "body", "title", "headline", "display"],
      radius: ["control", "card", "panel", "sheet"],
      shadow: [
        "card",
        "panel",
        "lifted",
        "agent",
        "sheet",
        "chip",
        "notification",
      ],
      animate: ["breathe", "ping-slow"],
    },
  },
});

/**
 * Joins class names, dropping anything falsy. Conflicting utilities resolve to
 * the last one given, so a caller's `className` reliably overrides a
 * component's defaults — without this, `bg-surface` and `bg-agent-tint` on the
 * same element resolve by stylesheet order, not by intent.
 */
export function cx(...parts: Array<string | false | null | undefined>) {
  return merge(parts.filter(Boolean).join(" "));
}

/** The three jobs colour does, plus the neutral "nothing happening" tone. */
export type Tone = "neutral" | "agent" | "alert" | "ok" | "idle";
