import type { Day } from "@/data/trip";
import { DayShape } from "@/ui/bars";
import { Card, Divider } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { Eyebrow, Num } from "@/ui/text";

// The Trip tab's days, each a row that opens in place into that day's own
// panel: its weather, its stops (editable), what the watch recommends for it.
// This is where "today" lives now; there is no separate Today screen.
//
// Native <details>. Exclusive through `name`, so opening one closes the last,
// keyboard- and screen-reader-operable with no script, and the closed days'
// panels are in the page already — opening is instant, with nothing to fetch.
// Which is open at first is the server's decision (the day in `?day=`, else
// today's), and it is plain markup, so it is right before any script runs.

/** A day's row, its frame: shared with its loading state so the two cannot differ. */
const ROW =
  "flex flex-col gap-2.5 px-4 py-3 lg:flex-row lg:items-center lg:gap-3.5 lg:px-[18px]";
/** The heading above the rows. */
const HEAD =
  "hidden items-center gap-3.5 border-b border-hairline bg-surface-subtle px-[18px] py-2.5 lg:flex";

export type DayRow = {
  day: Day;
  open: boolean;
  /** What opens: built by the page, which knows the trip's data. */
  panel: React.ReactNode;
};

export function DayAccordion({
  tripId,
  rows,
}: {
  tripId: string;
  rows: DayRow[];
}) {
  return (
    <Card className="overflow-hidden">
      <div className={HEAD}>
        <Eyebrow className="flex-1">Day</Eyebrow>
      </div>
      {rows.map(({ day, open, panel }, i) => (
        <div key={day.id}>
          {i > 0 ? <Divider /> : null}
          <details
            id={`day-${day.id}`}
            name={`days-${tripId}`}
            open={open}
            className="group"
          >
            <summary
              className={cx(
                `${ROW} cursor-pointer list-none transition-colors marker:hidden [&::-webkit-details-marker]:hidden`,
                day.state === "past" && "opacity-55 group-open:opacity-100",
                day.state === "today"
                  ? "border-l-[3px] border-agent bg-agent-tint"
                  : "hover:bg-canvas group-open:bg-canvas",
              )}
            >
              <div className="flex flex-1 items-start gap-2.5">
                <Icon
                  name="chevronDown"
                  size={15}
                  className="mt-0.5 shrink-0 -rotate-90 text-ink-faint transition-transform group-open:rotate-0"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <Num
                    className={cx(
                      "text-mini",
                      day.state === "today"
                        ? "font-semibold text-agent"
                        : "text-ink-faint",
                    )}
                  >
                    {day.stamp}
                  </Num>
                  <span
                    className={cx(
                      "text-small",
                      day.state === "today" ? "font-semibold" : "font-medium",
                    )}
                  >
                    {day.summary}
                  </span>
                </div>
              </div>

              <DayShape segments={day.shape} className="w-full lg:w-[250px]" />

              <div className="flex w-[120px] items-center gap-2">
                <Dot tone={day.watch.tone} />
                <span
                  className={cx(
                    "text-mini",
                    day.watch.tone === "alert"
                      ? "font-medium text-alert"
                      : day.watch.tone === "agent"
                        ? "text-agent"
                        : "text-ink-faint",
                  )}
                >
                  {day.watch.label}
                </span>
              </div>
            </summary>
            {panel}
          </details>
        </div>
      ))}
    </Card>
  );
}

/**
 * The days before they are known: the same card, heading and rows, with a grey
 * bar for each thing that is data. How many days there are is not known, so it
 * draws the few a trip usually has.
 */
export function DayAccordionSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card className="overflow-hidden" aria-busy="true">
      <div className={HEAD}>
        <Eyebrow className="flex-1">Day</Eyebrow>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders, never reordered
        <div key={i}>
          {i > 0 ? <Divider /> : null}
          <div className={cx(ROW, "animate-breathe")}>
            <div className="flex flex-1 items-start gap-2.5">
              <Icon
                name="chevronDown"
                size={15}
                className="mt-0.5 shrink-0 -rotate-90 text-ink-faint"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="h-[9px] w-[88px] rounded-[3px] bg-track" />
                <div className="h-[11px] w-[55%] rounded-[3px] bg-track" />
              </div>
            </div>
            <div className="flex h-[22px] w-full items-center lg:w-[250px]">
              <div className="h-[7px] w-full rounded-sm bg-track" />
            </div>
            <div className="flex w-[120px] items-center gap-2">
              <span className="size-[9px] rounded-full bg-track" />
              <div className="h-[9px] w-[64px] rounded-[3px] bg-track" />
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}
