import { cx } from "./cx";

type TextProps = {
  children: React.ReactNode;
  className?: string;
};

/** Section labels. Uppercase, tracked out, never longer than a few words. */
export function Eyebrow({
  children,
  className,
  tone = "neutral",
}: TextProps & { tone?: "neutral" | "agent" | "alert" | "ok" }) {
  return (
    <div
      className={cx(
        "text-micro font-semibold uppercase tracking-[0.12em]",
        tone === "neutral" && "text-ink-faint",
        tone === "agent" && "text-agent",
        tone === "alert" && "text-alert",
        tone === "ok" && "text-ok",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The one big thing on a screen. */
export function Display({
  children,
  className,
  as: Tag = "h1",
}: TextProps & { as?: "h1" | "h2" | "div" }) {
  return (
    <Tag
      className={cx("text-display font-semibold tracking-[-0.03em]", className)}
    >
      {children}
    </Tag>
  );
}

/** Card and panel headings. */
export function Headline({
  children,
  className,
  as: Tag = "h2",
}: TextProps & { as?: "h2" | "h3" | "div" }) {
  return (
    <Tag
      className={cx(
        "text-headline font-semibold tracking-[-0.024em]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Row and sub-section headings — the smallest thing still set in semibold. */
export function Title({
  children,
  className,
  as: Tag = "h3",
}: TextProps & { as?: "h2" | "h3" | "h4" | "div" }) {
  return (
    <Tag
      className={cx("text-title font-semibold tracking-[-0.014em]", className)}
    >
      {children}
    </Tag>
  );
}

/** Body copy that is deliberately quieter than the heading above it. */
export function Prose({ children, className }: TextProps) {
  return (
    <p className={cx("text-small text-ink-muted", className)}>{children}</p>
  );
}

/**
 * Times, distances, money and counts. DM Sans is already tabular through the
 * base layer; this adds the tracking the canvas uses for readouts.
 */
export function Num({ children, className }: TextProps) {
  return (
    <span className={cx("tracking-[0.01em] tabular-nums", className)}>
      {children}
    </span>
  );
}
