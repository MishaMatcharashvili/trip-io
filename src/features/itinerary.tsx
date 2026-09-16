import Link from "next/link";
import type { Checkpoint, Day, Trip } from "@/data/trip";
import { Divider } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { Num } from "@/ui/text";

/**
 * One node of the day. The three states read differently on purpose: what is
 * behind you recedes, what you are inside of is tinted in the agent's colour,
 * and anything a world event has matched carries a coral edge.
 */
export function CheckpointRow({
  checkpoint,
  href,
  className,
}: {
  checkpoint: Checkpoint;
  href?: string;
  className?: string;
}) {
  const { state, conflict } = checkpoint;
  const body = (
    <>
      <div
        className={cx(
          "w-[38px] shrink-0 pt-0.5 text-mini tracking-[0.01em]",
          state === "now" ? "font-semibold text-agent" : "text-ink-faint",
        )}
      >
        {checkpoint.time}
      </div>
      <Dot
        tone={state === "now" ? "agent" : conflict ? "alert" : "idle"}
        size={state === "now" ? 6 : 9}
        hollow={state === "upcoming"}
        className="mt-1.5"
      />
      <div className="min-w-0 flex-1">
        <div
          className={cx(
            "text-small",
            state === "now" ? "font-semibold" : "font-medium",
            state === "done" && "text-ink-muted",
          )}
        >
          {checkpoint.title}
        </div>
        {conflict ? (
          <div className="text-mini text-alert">{conflict}</div>
        ) : checkpoint.detail ? (
          <div
            className={cx(
              "text-mini",
              state === "now" ? "text-agent" : "text-ink-faint",
            )}
          >
            {checkpoint.detail}
          </div>
        ) : null}
      </div>
      {href ? (
        <Icon name="chevronRight" size={15} className="mt-0.5 text-ink-faint" />
      ) : null}
    </>
  );

  const rowClass = cx(
    "flex items-start gap-[11px] px-4 py-2.5",
    state === "now" && "bg-agent-tint",
    state === "done" && "opacity-70",
    conflict && "border-l-2 border-alert-bright",
    href && "transition-colors hover:bg-canvas",
    className,
  );

  return href ? (
    <Link href={href} className={rowClass}>
      {body}
    </Link>
  ) : (
    <div className={rowClass}>{body}</div>
  );
}

/** The day's nodes, in order, with hairlines between them. */
export function CheckpointList({
  day,
  trip,
  divided = false,
  linkPlaces = false,
}: {
  day: Day;
  trip: Trip;
  divided?: boolean;
  linkPlaces?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {day.checkpoints.map((checkpoint, i) => (
        <div key={checkpoint.id}>
          {divided && i > 0 ? <Divider /> : null}
          <CheckpointRow
            checkpoint={checkpoint}
            href={
              linkPlaces
                ? `/trips/${trip.id}/place/${checkpoint.id}`
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}

/** The done / left counters under a day. */
export function DayCount({ day }: { day: Day }) {
  const done = day.checkpoints.filter((c) => c.state === "done").length;
  return (
    <Num className="text-mini text-ink-faint">
      {done}/{day.checkpoints.length}
    </Num>
  );
}
