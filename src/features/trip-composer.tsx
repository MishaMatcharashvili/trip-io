"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { focusAreas } from "@/domain/catalogue/focus-areas";
// Types only: constraints.ts hashes with node:crypto, which has no place in
// the browser bundle.
import type { Constraints, Interest } from "@/domain/trip/generate/constraints";
import { understand } from "@/domain/trip/generate/request";
import { Button, ButtonLink } from "@/ui/button";
import { Card, Divider } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { Eyebrow } from "@/ui/text";

// The ask. The sentence is read as it is typed (src/domain/trip/generate/
// request.ts) and shown back as cards; any card can be corrected by hand, and
// a correction wins over whatever the sentence says from then on.

const areaNames: Record<string, string> = {
  "tbilisi-core": "Tbilisi",
  "kazbegi-corridor": "Kazbegi",
  kakheti: "Kakheti",
  svaneti: "Svaneti",
};

const interests: Interest[] = ["heritage", "nature", "culture", "food"];

const interestNames: Record<string, string> = {
  heritage: "Heritage",
  nature: "Nature",
  culture: "Culture",
  food: "Food & wine",
};

const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** Constraints as a URL-safe token for /new/building. */
export function encodeConstraints(c: Constraints): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(c))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

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

export function TripComposer({
  today,
  examples,
  placeholder,
}: {
  /** YYYY-MM-DD in Tbilisi, from the server so both sides agree. */
  today: string;
  examples: string[];
  placeholder: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Partial<Constraints>>({});
  const [editing, setEditing] = useState<Field | null>(null);

  const read = useMemo(() => understand(text, today), [text, today]);
  const c: Constraints = { ...read.constraints, ...overrides };
  const said = (k: keyof Constraints) =>
    k in overrides || read.said.includes(k);
  const set = (patch: Partial<Constraints>) =>
    setOverrides((o) => ({ ...o, ...patch }));

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

  const submit = () => router.push(`/new/building?c=${encodeConstraints(c)}`);

  return (
    <div className="flex w-full flex-col gap-4">
      <Card className="flex w-full flex-col gap-3 rounded-[16px] p-4 shadow-lifted lg:gap-4 lg:p-5 lg:pb-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Describe your trip"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full resize-none bg-transparent text-[15px] leading-[1.5] outline-none placeholder:text-ink-faint lg:text-headline lg:tracking-[-0.01em]"
        />
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
            >
              <Chip className="cursor-pointer hover:border-control">
                {example}
              </Chip>
            </button>
          ))}
        </div>
        <Divider />
        <div className="flex items-center gap-3">
          <span className="hidden text-mini text-ink-faint lg:inline">
            Enter to plan · Shift+Enter for a new line
          </span>
          <div className="flex-1" />
          <ButtonLink
            href="/saved"
            variant="ghost"
            className="hidden lg:inline-flex"
          >
            Start from a saved trip
          </ButtonLink>
          <Button variant="primary" className="px-5" onClick={submit}>
            Plan my trip
          </Button>
        </div>
      </Card>

      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center gap-2">
          <Icon name="sparkle" size={15} className="text-agent" />
          <span className="text-small font-medium">
            Here is what I understood — correct anything before I build it
          </span>
        </div>
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
      </div>
    </div>
  );
}
