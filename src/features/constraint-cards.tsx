"use client";

import { useState } from "react";
import { focusAreas } from "@/domain/catalogue/focus-areas";
// Types only: constraints.ts hashes with node:crypto, which has no place in
// the browser bundle.
import type { Constraints, Interest } from "@/domain/trip/generate/constraints";
import { Card } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Eyebrow } from "@/ui/text";
import { areaNames, interestNames } from "./constraint-labels";

// What the trip will be built from, as five cards. Any card can be corrected
// by hand; what was assumed rather than said is labelled as assumed.

const interests: Interest[] = ["heritage", "nature", "culture", "food"];

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

type Field = "areas" | "days" | "budget" | "interests" | "party";

function Toggle({
  on,
  children,
  onClick,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        "rounded-full border px-3 py-1 text-mini font-medium transition-colors",
        on
          ? "border-agent bg-agent-tint text-agent"
          : "border-control bg-surface text-ink-muted hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const numberInput =
  "h-9 w-20 rounded-control border border-control bg-surface px-2 text-small";

export function ConstraintCards({
  constraints: c,
  said,
  onChange: set,
  today,
}: {
  constraints: Constraints;
  /** Whether a field was stated, as opposed to filled with a default. */
  said: (k: keyof Constraints) => boolean;
  onChange: (patch: Partial<Constraints>) => void;
  /** YYYY-MM-DD in Tbilisi: the earliest start date. */
  today: string;
}) {
  const [editing, setEditing] = useState<Field | null>(null);

  const people = c.party.adults + c.party.children;
  const cards: { field: Field; label: string; value: string; note: string }[] =
    [
      {
        field: "areas",
        label: "Region",
        value: c.areas.map((a) => areaNames[a]).join(" · "),
        note: said("areas") ? "Georgia" : "Assumed — tap to choose",
      },
      {
        field: "days",
        label: "Length",
        value: `${c.days} day${c.days === 1 ? "" : "s"}`,
        note: `From ${longDate(c.startDate)}${said("startDate") ? "" : " · assumed"}`,
      },
      {
        field: "budget",
        label: "Budget",
        value: `€${c.budgetEur.toLocaleString("en-GB")}`,
        note: said("budgetEur") ? "Excl. flights" : "Assumed · excl. flights",
      },
      {
        field: "interests",
        label: "Interests",
        value: c.interests.length
          ? c.interests.map((i) => interestNames[i]).join(", ")
          : "A bit of everything",
        note: `${c.mobility === "low" ? "Gentle" : c.mobility === "high" ? "Strenuous" : "Moderate"} walking`,
      },
      {
        field: "party",
        label: "Travellers",
        value: `${people} ${people === 1 ? "person" : "people"}`,
        note: `${c.pace[0].toUpperCase()}${c.pace.slice(1)} pace${said("pace") ? "" : " assumed"}`,
      },
    ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map((card) => (
          <button
            key={card.field}
            type="button"
            onClick={() =>
              setEditing(editing === card.field ? null : card.field)
            }
            className="text-left"
          >
            <Card
              className={cx(
                "flex h-full flex-col gap-1.5 px-3.5 py-3 transition-colors hover:bg-canvas",
                editing === card.field && "border-agent",
              )}
            >
              <Eyebrow tone={editing === card.field ? "agent" : "neutral"}>
                {card.label}
              </Eyebrow>
              <span className="text-small font-medium">{card.value}</span>
              <span className="text-mini text-ink-faint">{card.note}</span>
            </Card>
          </button>
        ))}
      </div>

      {editing ? (
        <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
          {editing === "areas"
            ? focusAreas.map((a) => (
                <Toggle
                  key={a.slug}
                  on={c.areas.includes(a.slug)}
                  onClick={() => {
                    const next = c.areas.includes(a.slug)
                      ? c.areas.filter((s) => s !== a.slug)
                      : [...c.areas, a.slug];
                    if (next.length) set({ areas: next });
                  }}
                >
                  {areaNames[a.slug]}
                </Toggle>
              ))
            : null}
          {editing === "days" ? (
            <>
              <label className="flex items-center gap-2 text-small">
                Days
                <input
                  type="number"
                  min={1}
                  max={21}
                  value={c.days}
                  onChange={(e) =>
                    set({
                      days: Math.min(21, Math.max(1, Number(e.target.value))),
                    })
                  }
                  className={numberInput}
                />
              </label>
              <label className="flex items-center gap-2 text-small">
                Starting
                <input
                  type="date"
                  min={today}
                  value={c.startDate}
                  onChange={(e) =>
                    e.target.value && set({ startDate: e.target.value })
                  }
                  className="h-9 rounded-control border border-control bg-surface px-2 text-small"
                />
              </label>
            </>
          ) : null}
          {editing === "budget" ? (
            <label className="flex items-center gap-2 text-small">
              € for the whole trip, excluding flights
              <input
                type="number"
                min={0}
                step={50}
                value={c.budgetEur}
                onChange={(e) =>
                  set({ budgetEur: Math.max(0, Number(e.target.value)) })
                }
                className={cx(numberInput, "w-28")}
              />
            </label>
          ) : null}
          {editing === "interests" ? (
            <>
              {interests.map((i) => (
                <Toggle
                  key={i}
                  on={c.interests.includes(i)}
                  onClick={() =>
                    set({
                      interests: c.interests.includes(i)
                        ? c.interests.filter((x) => x !== i)
                        : [...c.interests, i],
                    })
                  }
                >
                  {interestNames[i]}
                </Toggle>
              ))}
              <span className="h-5 w-px bg-hairline" />
              {(["low", "moderate", "high"] as const).map((m) => (
                <Toggle
                  key={m}
                  on={c.mobility === m}
                  onClick={() => set({ mobility: m })}
                >
                  {m === "low"
                    ? "Gentle walking"
                    : m === "high"
                      ? "Strenuous"
                      : "Moderate walking"}
                </Toggle>
              ))}
            </>
          ) : null}
          {editing === "party" ? (
            <>
              <label className="flex items-center gap-2 text-small">
                Adults
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={c.party.adults}
                  onChange={(e) =>
                    set({
                      party: {
                        ...c.party,
                        adults: Math.min(
                          12,
                          Math.max(1, Number(e.target.value)),
                        ),
                      },
                    })
                  }
                  className={numberInput}
                />
              </label>
              <label className="flex items-center gap-2 text-small">
                Children
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={c.party.children}
                  onChange={(e) =>
                    set({
                      party: {
                        ...c.party,
                        children: Math.min(
                          12,
                          Math.max(0, Number(e.target.value)),
                        ),
                      },
                    })
                  }
                  className={numberInput}
                />
              </label>
              <span className="h-5 w-px bg-hairline" />
              {(["relaxed", "moderate", "packed"] as const).map((p) => (
                <Toggle
                  key={p}
                  on={c.pace === p}
                  onClick={() => set({ pace: p })}
                >
                  {p[0].toUpperCase() + p.slice(1)}
                </Toggle>
              ))}
            </>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
