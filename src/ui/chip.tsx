import Link from "next/link";
import { cx, type Tone } from "./cx";
import { Dot } from "./dot";

const tones: Record<Tone, string> = {
  neutral: "border-hairline bg-surface text-ink-muted",
  agent: "border-agent-line bg-agent-tint text-agent",
  alert: "border-alert-line bg-alert-tint text-alert",
  ok: "border-ok-line bg-ok-tint text-ok",
  idle: "border-hairline bg-surface text-ink-faint",
};

type Styling = {
  tone?: Tone;
  size?: "sm" | "md";
  /** Lifts the chip so it reads over the map rather than on it. */
  floating?: boolean;
  className?: string;
};

function chipClass({
  tone = "neutral",
  size = "md",
  floating,
  className,
}: Styling) {
  return cx(
    "inline-flex items-center gap-1.5 rounded-full border",
    size === "md" ? "h-7 px-[11px] text-[12px]" : "h-6 px-2.5 text-mini",
    tones[tone],
    floating && "shadow-chip",
    className,
  );
}

export function Chip({
  children,
  ...styling
}: Styling & { children: React.ReactNode }) {
  return <span className={chipClass(styling)}>{children}</span>;
}

export function ChipLink({
  href,
  children,
  ...styling
}: Styling & { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(chipClass(styling), "transition-colors hover:bg-canvas")}
    >
      {children}
    </Link>
  );
}

/**
 * The product's heartbeat: whether the watch layer is running, and against how
 * many sources. It appears wherever a trip is live, because the state of the
 * product should be visible before you open anything.
 */
export function WatchChip({
  state,
  label,
  className,
}: {
  state: "watching" | "paused";
  label: string;
  className?: string;
}) {
  const watching = state === "watching";
  return (
    <span
      className={chipClass({ tone: watching ? "ok" : "neutral", className })}
    >
      <Dot tone={watching ? "ok" : "idle"} breathe={watching} />
      <span className="font-medium">{label}</span>
    </span>
  );
}
