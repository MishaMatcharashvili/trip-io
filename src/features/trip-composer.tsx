"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  destinationName,
  destinations,
  MAX_PLACES,
} from "@/domain/catalogue/destinations";
// Types only: constraints.ts hashes with node:crypto, which has no place in
// the browser bundle.
import type { Constraints, Interest } from "@/domain/trip/generate/constraints";
import {
  assess,
  type Judgement,
  reasons,
} from "@/domain/trip/generate/feasibility";
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
//
// A card's colour says where its value came from: yellow is my assumption,
// green is the traveller's own word, and red is something that cannot be done
// (src/domain/trip/generate/feasibility.ts) — with the reason underneath, and
// no trip built until it is put right.

const byName = [...destinations].sort((a, b) => a.name.localeCompare(b.name));

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

type Field = "places" | "days" | "budget" | "interests" | "party";

type Standing = "assumed" | "said" | "impossible";

/** Washes, not fills: the card still reads as a card, in both themes. */
const standings: Record<Standing, { card: string; label: string }> = {
  assumed: { card: "border-assumed/40 bg-assumed/10", label: "text-assumed" },
  said: { card: "border-ok/35 bg-ok/10", label: "text-ok" },
  impossible: { card: "border-alert/45 bg-alert/10", label: "text-alert" },
};

const legend: [Standing, string][] = [
  ["assumed", "My assumption"],
  ["said", "From you"],
  ["impossible", "Can’t be done"],
];

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

/**
 * The route, in the order it is travelled: the first place is the start, the
 * last the finish. Any place in Georgia can be added, and any moved earlier.
 */
function PlacesEditor({
  places,
  onChange,
}: {
  places: string[];
  onChange: (places: string[]) => void;
}) {
  const earlier = (i: number) => {
    const next = [...places];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  };
  return (
    <>
      {places.map((slug, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a round trip names a place twice
          key={`${slug}-${i}`}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-control bg-surface pl-3 pr-1 text-mini font-medium"
        >
          {places.length > 1 && (i === 0 || i === places.length - 1) ? (
            <span className="text-ink-faint">
              {i === 0 ? "Start" : "Finish"}
            </span>
          ) : null}
          {destinationName(slug)}
          {i > 0 ? (
            <button
              type="button"
              aria-label={`Visit ${destinationName(slug)} earlier`}
              onClick={() => earlier(i)}
              className="flex size-6 items-center justify-center rounded-full text-ink-faint hover:bg-fill hover:text-ink"
            >
              <Icon name="chevronLeft" size={13} />
            </button>
          ) : null}
          {places.length > 1 ? (
            <button
              type="button"
              aria-label={`Remove ${destinationName(slug)}`}
              onClick={() => onChange(places.filter((_, j) => j !== i))}
              className="flex size-6 items-center justify-center rounded-full text-ink-faint hover:bg-fill hover:text-ink"
            >
              ×
            </button>
          ) : null}
        </span>
      ))}
      {places.length < MAX_PLACES ? (
        <select
          aria-label="Add a place"
          value=""
          onChange={(e) =>
            e.target.value && onChange([...places, e.target.value])
          }
          className="h-8 rounded-control border border-control bg-surface px-2 text-mini text-ink-muted"
        >
          <option value="">Add a place…</option>
          {byName.map((d) => (
            <option key={d.slug} value={d.slug}>
              {d.name}
            </option>
          ))}
        </select>
      ) : null}
    </>
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
  const box = useRef<HTMLTextAreaElement>(null);

  // "New trip" anywhere in the app is /#plan: arriving on it, or tapping it
  // here, puts the cursor in the box rather than leaving it to be found.
  useEffect(() => {
    const focusIfAsked = () => {
      if (window.location.hash === "#plan") box.current?.focus();
    };
    focusIfAsked();
    window.addEventListener("hashchange", focusIfAsked);
    return () => window.removeEventListener("hashchange", focusIfAsked);
  }, []);

  const read = useMemo(() => understand(text, today), [text, today]);
  const c: Constraints = useMemo(
    () => ({ ...read.constraints, ...overrides }),
    [read, overrides],
  );
  const said = (k: keyof Constraints) =>
    k in overrides || read.said.includes(k);
  const set = (patch: Partial<Constraints>) =>
    setOverrides((o) => ({ ...o, ...patch }));

  const verdict = useMemo(() => assess(c, read.refused), [c, read.refused]);
  const blockers = reasons(verdict);

  /** Red when it cannot be done; otherwise whose word the value is. */
  const standing = (key: keyof Constraints, judged?: Judgement): Standing =>
    judged?.level === "impossible"
      ? "impossible"
      : said(key)
        ? "said"
        : "assumed";
  /** The judgement when there is one to make, else what the card would say anyway. */
  const noted = (judged: Judgement, otherwise: string) =>
    judged.level === "ok" ? otherwise : judged.note;

  const people = c.party.adults + c.party.children;
  const cards: {
    field: Field;
    label: string;
    value: string;
    note: string;
    standing: Standing;
  }[] = [
    {
      field: "places",
      label: c.places.length === 1 ? "Place" : "Places",
      value: c.places.map(destinationName).join(" → "),
      note: noted(
        verdict.places,
        !said("places")
          ? "Assumed — tap to choose"
          : c.places.length === 1
            ? "Start and finish"
            : `Start in ${destinationName(c.places[0])}, finish in ${destinationName(c.places.at(-1) as string)}`,
      ),
      standing: standing("places", verdict.places),
    },
    {
      field: "days",
      label: "Length",
      value: `${c.days} day${c.days === 1 ? "" : "s"}`,
      note: noted(
        verdict.days,
        `${said("days") ? "From" : "Assumed · from"} ${longDate(c.startDate)}${said("days") && !said("startDate") ? " · date assumed" : ""}`,
      ),
      standing: standing("days", verdict.days),
    },
    {
      field: "budget",
      label: "Budget",
      value: `€${c.budgetEur.toLocaleString("en-GB")}`,
      // The budget is always judged, whoever named the figure.
      note:
        said("budgetEur") || verdict.budget.level === "impossible"
          ? verdict.budget.note
          : `Assumed · ${verdict.budget.note.toLowerCase()}`,
      standing: standing("budgetEur", verdict.budget),
    },
    {
      field: "interests",
      label: "Interests",
      value: c.interests.length
        ? c.interests.map((i) => interestNames[i]).join(", ")
        : "A bit of everything",
      note: `${said("interests") ? "" : "Assumed · "}${c.mobility === "low" ? "gentle" : c.mobility === "high" ? "strenuous" : "moderate"} walking`,
      standing: standing("interests"),
    },
    {
      field: "party",
      label: "Travellers",
      value: `${people} ${people === 1 ? "person" : "people"}`,
      note: `${said("party") ? "" : "Assumed · "}${c.pace} pace`,
      standing: standing("party"),
    },
  ];

  const submit = () => {
    if (verdict.possible)
      router.push(`/new/building?c=${encodeConstraints(c)}`);
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <Card className="flex w-full flex-col gap-3 rounded-[16px] p-4 shadow-lifted lg:gap-4 lg:p-5 lg:pb-4">
        {/* The suggestions sit to the right of the box; a phone has no right, so they follow it. */}
        <div className="flex flex-col gap-3 lg:flex-row lg:gap-5">
          <textarea
            ref={box}
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
            className="w-full min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-[1.5] outline-none placeholder:text-ink-faint lg:min-h-[132px] lg:text-headline lg:tracking-[-0.01em]"
          />
          <div className="flex flex-col gap-2 lg:w-[300px] lg:shrink-0 lg:border-l lg:border-hairline lg:pl-5">
            <Eyebrow>Try one of these</Eyebrow>
            <div className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap lg:items-start">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setText(example)}
                >
                  <Chip className="h-auto min-h-7 cursor-pointer rounded-2xl py-1 text-left hover:border-control">
                    {example}
                  </Chip>
                </button>
              ))}
            </div>
          </div>
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
          <Button
            variant="primary"
            className="px-5 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!verdict.possible}
            onClick={submit}
          >
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
                data-standing={card.standing}
                className={cx(
                  "flex h-full flex-col gap-1.5 px-3.5 py-3 transition-colors hover:brightness-[0.97]",
                  standings[card.standing].card,
                  editing === card.field && "ring-2 ring-agent",
                )}
              >
                <Eyebrow className={standings[card.standing].label}>
                  {card.label}
                </Eyebrow>
                <span className="text-small font-medium">{card.value}</span>
                <span
                  className={cx(
                    "text-mini",
                    card.standing === "impossible"
                      ? "font-medium text-alert"
                      : "text-ink-muted",
                  )}
                >
                  {card.note}
                </span>
              </Card>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-mini text-ink-faint">
          {legend.map(([key, words]) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span
                className={cx(
                  "size-2.5 rounded-[3px] border",
                  standings[key].card,
                )}
              />
              {words}
            </span>
          ))}
        </div>

        {blockers.length ? (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-card border border-alert/45 bg-alert/10 px-4 py-3"
          >
            <span className="text-small font-semibold text-alert">
              This trip can’t be done as asked
            </span>
            {blockers.map((why) => (
              <span key={why} className="text-small">
                {why}
              </span>
            ))}
          </div>
        ) : null}

        {editing ? (
          <Card className="flex flex-wrap items-center gap-3 px-4 py-3">
            {editing === "places" ? (
              <PlacesEditor
                places={c.places}
                onChange={(places) => set({ places })}
              />
            ) : null}
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
