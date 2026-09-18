import { cx } from "./cx";
import { Eyebrow } from "./text";

type Accent = "none" | "agent" | "alert" | "ok";

const accents: Record<Accent, string> = {
  none: "border-hairline",
  agent: "border-agent-line",
  alert: "border-alert-line",
  ok: "border-ok-line",
};

/** A flat card sitting on the canvas. */
export function Card({
  accent = "none",
  className,
  ...rest
}: { accent?: Accent } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-card border bg-surface",
        accents[accent],
        className,
      )}
      {...rest}
    />
  );
}

/** A card that floats over the map — same skin, more lift. */
export function Panel({
  accent = "none",
  className,
  ...rest
}: { accent?: Accent } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-panel border bg-surface shadow-panel",
        accent === "none" ? "border-hairline-strong" : accents[accent],
        className,
      )}
      {...rest}
    />
  );
}

/** The hairline that separates rows inside a card. */
export function Divider({ className }: { className?: string }) {
  return <div className={cx("h-px bg-hairline", className)} />;
}

/** An eyebrow with a rule running to the end of the column. */
export function SectionRule({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "agent" | "alert" | "ok";
  className?: string;
}) {
  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <Eyebrow tone={tone}>{children}</Eyebrow>
      <div className="h-px flex-1 bg-hairline" />
    </div>
  );
}

/**
 * A labelled line of evidence — "Changed", "Affects", "I suggest". The label
 * column is fixed so the three read as one block.
 */
export function EvidenceRow({
  label,
  children,
  labelWidth = "w-[74px]",
  className,
}: {
  label: string;
  children: React.ReactNode;
  labelWidth?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <Eyebrow className={cx("shrink-0 pt-0.5", labelWidth)}>{label}</Eyebrow>
      <div className="flex-1 text-small">{children}</div>
    </div>
  );
}
