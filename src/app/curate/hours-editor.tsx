"use client";

import { weekdays } from "@/core/catalogue/opening-hours";
import type { DraftErrors, HoursDraft } from "./draft";

const dayLabel = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
} as const;

const monthLabel = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function HoursEditor({
  value,
  errors,
  onChange,
}: {
  value: HoursDraft;
  errors: DraftErrors;
  onChange: (next: HoursDraft) => void;
}) {
  const set = (patch: Partial<HoursDraft>) => onChange({ ...value, ...patch });

  const toggleMonth = (month: number) =>
    set({
      months: value.months.includes(month)
        ? value.months.filter((m) => m !== month)
        : [...value.months, month],
    });

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-medium">Opening hours</legend>

      <div className="flex gap-2">
        {(
          [
            ["weekly", "Weekly hours"],
            ["always", "Always open"],
          ] as const
        ).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            onClick={() => set({ kind })}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              value.kind === kind
                ? "border-foreground bg-foreground text-background"
                : "border-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {errors.hours && <p className="text-sm text-red-600">{errors.hours}</p>}

      {value.kind === "weekly" && (
        <div className="flex flex-col gap-1.5">
          {weekdays.map((day) => (
            <label key={day} className="flex items-center gap-2 text-sm">
              <span className="w-9 text-zinc-500">{dayLabel[day]}</span>
              <input
                value={value.days[day]}
                onChange={(e) =>
                  set({ days: { ...value.days, [day]: e.target.value } })
                }
                placeholder="10:00-19:00 or closed"
                className={`flex-1 rounded-md border bg-transparent px-2 py-1 font-mono ${
                  errors[day] ? "border-red-500" : "border-zinc-300"
                }`}
              />
              {day === "mon" && (
                <button
                  type="button"
                  onClick={() =>
                    set({
                      days: Object.fromEntries(
                        weekdays.map((d) => [d, value.days.mon]),
                      ) as HoursDraft["days"],
                    })
                  }
                  className="text-xs text-zinc-500 underline"
                >
                  copy to all
                </button>
              )}
              {errors[day] && (
                <span className="text-xs text-red-600">{errors[day]}</span>
              )}
            </label>
          ))}
          <p className="text-xs text-zinc-500">
            Several intervals: <code>10-14, 15:30-22</code>. Past midnight:{" "}
            <code>20:00-02:00</code>.
          </p>
        </div>
      )}

      {value.kind !== null && (
        <>
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <span className="mr-1 text-zinc-500">Season</span>
            {monthLabel.map((label, i) => {
              const month = i + 1;
              const on = value.months.includes(month);
              return (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed 12-month list
                  key={i}
                  type="button"
                  title={new Date(2000, i).toLocaleString("en", {
                    month: "long",
                  })}
                  onClick={() => toggleMonth(month)}
                  className={`h-7 w-7 rounded ${
                    on
                      ? "bg-foreground text-background"
                      : "border border-zinc-300"
                  }`}
                >
                  {label}
                </button>
              );
            })}
            <span className="ml-1 text-xs text-zinc-500">
              {value.months.length === 0 ? "all year" : ""}
            </span>
          </div>
          <input
            value={value.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="Hours note (e.g. closed on religious holidays)"
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 text-sm"
          />
        </>
      )}
    </fieldset>
  );
}
