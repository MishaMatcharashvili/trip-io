import { cx, type Tone } from "./cx";

const fills: Record<Tone, string> = {
  neutral: "bg-ink-faint",
  agent: "bg-agent",
  alert: "bg-alert",
  ok: "bg-ok",
  idle: "bg-ink-idle",
};

/**
 * The smallest carrier of status in the system. One coloured dot is enough to
 * mark a row as urgent — it is why the rest of the screen can stay neutral.
 */
export function Dot({
  tone = "neutral",
  size = 6,
  /** The slow fade that means "still checking". */
  breathe = false,
  /** An unvisited checkpoint: outlined rather than filled. */
  hollow = false,
  className,
}: {
  tone?: Tone;
  size?: number;
  breathe?: boolean;
  hollow?: boolean;
  className?: string;
}) {
  const borders: Record<Tone, string> = {
    neutral: "border-ink-faint",
    agent: "border-agent",
    alert: "border-alert-bright",
    ok: "border-ok",
    idle: "border-ink-idle",
  };

  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cx(
        "block shrink-0 rounded-full",
        hollow ? cx("border-[1.5px] bg-surface", borders[tone]) : fills[tone],
        breathe && "animate-breathe",
        className,
      )}
    />
  );
}
