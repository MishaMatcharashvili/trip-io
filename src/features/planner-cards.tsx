import { destinationName } from "@/domain/catalogue/destinations";
import {
  type Constraints,
  type Interest,
  interests,
  routeOf,
} from "@/domain/trip/generate/constraints";
import type { IntakeOption } from "@/domain/trip/generate/intake";
import type { Sketch } from "@/domain/trip/generate/sketch";
import { Card } from "@/ui/card";
import { Chip, FilterChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { Eyebrow, Num } from "@/ui/text";
import { interestNames } from "./constraint-labels";

// The cards the planner puts down in the conversation on /new, between its
// messages and the build: the choices it offers, and the trip as it stands so
// far. Neither builds anything. The day-by-day plan, with its editable stops,
// is made only by the build, once the traveller says it looks right.

const hours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round((min % 60) / 5) * 5;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m}`;
};

const weekday = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/**
 * The ways the trip could go, side by side. One tap takes a card's change and
 * tells the planner which was chosen; the others go with the question.
 */
export function OptionCards({
  options,
  disabled,
  onPick,
}: {
  options: IntakeOption[];
  disabled?: boolean;
  onPick: (option: IntakeOption) => void;
}) {
  return (
    <div
      className={cx(
        "grid gap-2.5",
        options.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2",
      )}
    >
      {options.map((option, i) => (
        <button
          key={option.title}
          type="button"
          disabled={disabled}
          onClick={() => onPick(option)}
          style={{ animationDelay: `${i * 70}ms` }}
          className="group text-left motion-safe:animate-pop-in disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Card className="flex h-full flex-col gap-1.5 px-3.5 py-3 transition-colors group-hover:border-agent-line group-hover:bg-agent-tint group-focus-visible:ring-2 group-focus-visible:ring-agent">
            <span className="flex items-start justify-between gap-2">
              <span className="text-small font-semibold">{option.title}</span>
              <Icon
                name="arrowRight"
                size={13}
                className="mt-0.5 shrink-0 text-ink-faint transition-colors group-hover:text-agent"
              />
            </span>
            {option.detail ? (
              <span className="text-mini text-ink-muted">{option.detail}</span>
            ) : null}
          </Card>
        </button>
      ))}
    </div>
  );
}

/** How the days of a sketch are listed before the rest fold into one line. */
const DAYS_SHOWN = 5;

/**
 * The trip as the conversation has it so far, in the numbers the planner is
 * quoting: where each day is spent, what it drives, when it starts and ends,
 * and what the money comes to a head. What the traveller has not said yet is
 * marked as assumed, so the card never claims more than was agreed, and a
 * route nobody gave is not drawn at all. What they enjoy is chosen on the card
 * itself: it decides every stop the build picks.
 */
export function TripSketchCard({
  constraints: c,
  sketch,
  said,
  blockers,
  ready,
  onInterests,
  children,
}: {
  constraints: Constraints;
  sketch: Sketch;
  said: (k: keyof Constraints) => boolean;
  /** Why the trip cannot be done as asked; the card turns red while any stand. */
  blockers: string[];
  /** The planner has nothing left to ask. */
  ready: boolean;
  /** What the traveller enjoys, chosen on the card. */
  onInterests: (next: Interest[]) => void;
  /** The card's actions: the build, and the details to correct. */
  children?: React.ReactNode;
}) {
  const placed = said("places");
  const shown = placed ? sketch.days.slice(0, DAYS_SHOWN) : [];
  const rest = placed ? sketch.days.slice(DAYS_SHOWN) : [];
  const facts: { text: string; assumed: boolean }[] = [
    {
      text: `${sketch.people} ${sketch.people === 1 ? "person" : "people"}`,
      assumed: !said("party"),
    },
    {
      text: `€${sketch.perPersonDay} a head a day`,
      assumed: !said("budgetEur"),
    },
    {
      text: `${c.pace[0].toUpperCase()}${c.pace.slice(1)}`,
      assumed: !said("pace"),
    },
  ];
  const toggle = (i: Interest) =>
    onInterests(
      c.interests.includes(i)
        ? c.interests.filter((x) => x !== i)
        : interests.filter((x) => x === i || c.interests.includes(x)),
    );

  return (
    <Card
      accent={blockers.length ? "alert" : ready ? "agent" : "none"}
      className={cx(
        "flex flex-col gap-3 px-4 py-3.5 motion-safe:animate-pop-in",
        ready && !blockers.length && "shadow-agent",
      )}
    >
      <div className="flex flex-col gap-1">
        <Eyebrow tone={blockers.length ? "alert" : ready ? "agent" : "neutral"}>
          {blockers.length
            ? "Can’t be done as asked"
            : ready
              ? "Ready to plan"
              : "The trip so far"}
        </Eyebrow>
        <span
          className={cx(
            "text-title font-semibold tracking-[-0.014em]",
            !placed && "text-ink-muted",
          )}
        >
          {placed
            ? routeOf(c).map(destinationName).join(" → ")
            : "Where in Georgia? Not said yet"}
        </span>
        <span className="text-mini text-ink-muted">
          <Num>
            {said("days") || placed
              ? `${c.days} ${c.days === 1 ? "day" : "days"} from ${weekday(c.startDate)}`
              : "How long, not said yet"}
          </Num>
          {placed && sketch.driveMinutes ? (
            <>
              {" · "}
              <Num>{hours(sketch.driveMinutes)}</Num> on the road in all
            </>
          ) : null}
          {(said("days") || placed) && (!said("days") || !said("startDate"))
            ? " · dates assumed"
            : ""}
        </span>
      </div>

      {placed ? (
        <ol className="flex flex-col divide-y divide-hairline border-y border-hairline">
          {shown.map((d) => (
            <li
              key={d.day}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2"
            >
              <span className="text-small">
                <span className="text-ink-faint">
                  <Num>Day {d.day}</Num> ·{" "}
                </span>
                <span className="font-medium">{destinationName(d.place)}</span>
              </span>
              <span className="text-mini text-ink-muted">
                <Num>
                  {d.starts}–{d.ends}
                </Num>
                {d.drives.map((l) => (
                  <span key={`${l.from}-${l.to}`}>
                    {" · "}
                    <Num>{hours(l.minutes)}</Num>{" "}
                    {l.to === d.place
                      ? "drive in"
                      : `to ${destinationName(l.to)}`}
                  </span>
                ))}
              </span>
            </li>
          ))}
          {rest.length ? (
            <li className="py-2 text-mini text-ink-muted">
              and {rest.length} more {rest.length === 1 ? "day" : "days"} in{" "}
              {[...new Set(rest.map((d) => destinationName(d.place)))].join(
                ", ",
              )}
            </li>
          ) : null}
        </ol>
      ) : null}

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-small font-medium">
          {said("interests") ? "What you enjoy" : "What do you enjoy?"}
          {said("interests") ? null : (
            <span className="font-normal text-ink-muted">
              {" "}
              Pick any: every stop is chosen by it.
            </span>
          )}
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {interests.map((i) => (
            <FilterChip
              key={i}
              selected={c.interests.includes(i)}
              onClick={() => toggle(i)}
            >
              {interestNames[i]}
            </FilterChip>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-1.5">
        {facts.map((f) => (
          <Chip
            key={f.text}
            size="sm"
            tone={f.assumed ? "idle" : "neutral"}
            className={cx(f.assumed && "border-dashed")}
          >
            {f.text}
          </Chip>
        ))}
      </div>

      {blockers.length ? (
        <div role="alert" className="flex flex-col gap-1">
          {blockers.map((why) => (
            <span key={why} className="text-small text-alert">
              {why}
            </span>
          ))}
        </div>
      ) : null}

      {children}
    </Card>
  );
}
