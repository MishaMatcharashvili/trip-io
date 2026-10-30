"use client";

import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import {
  destinationName,
  searchDestinations,
} from "@/domain/catalogue/destinations";
import { type MustSee, mustSee } from "@/domain/trip/generate/constraints";
import { withGuestSession } from "@/lib/guest-session";
import { apiClient } from "@/lib/hono-client";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";

// Where to go, typed rather than scrolled for: the towns and regions a trip
// can visit, found as the letters go in, and — unless only a town will do —
// the sights in them by name (src/bll/sight-search.ts). A sight the catalogue
// lacks is Google's, and is taken in when picked.

const searched = z.object({
  ok: z.literal(true),
  sights: z.array(mustSee),
  more: z.array(
    z.object({ externalId: z.string(), name: z.string(), where: z.string() }),
  ),
});
const picked = z.object({ ok: z.literal(true), sight: mustSee });
const refused = z.object({ reason: z.string() });

const PICK_FAILED: Record<string, string> = {
  "not-a-sight": "That is not somewhere to visit. Try the sight’s own name.",
  outside: "That is outside the places a trip can go.",
  "not-found": "Google no longer has that place.",
  "rate-limited": "That is a lot of places in a day. Try again tomorrow.",
};

/** Long enough to type a word without a request a letter. */
const DEBOUNCE_MS = 250;

type Option = {
  key: string;
  title: string;
  detail: string;
  pick: () => void | Promise<void>;
};

export function PlaceSearch({
  label,
  placeholder,
  destinationsOnly = false,
  onDestination,
  onSight,
  autoFocus = false,
}: {
  label: string;
  placeholder: string;
  /** Towns and regions only: where a trip starts or finishes. */
  destinationsOnly?: boolean;
  onDestination: (slug: string) => void;
  onSight?: (sight: MustSee) => void;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [remote, setRemote] = useState<z.infer<typeof searched> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // One search session, from the first letter to the pick: Google bills the
  // typing in it as one with the pick.
  const session = useRef(crypto.randomUUID());
  const asked = useRef(0);

  const q = text.trim();
  useEffect(() => {
    if (destinationsOnly || q.length < 2) {
      setRemote(null);
      return;
    }
    const mine = ++asked.current;
    const timer = setTimeout(async () => {
      try {
        const res = await withGuestSession(() =>
          apiClient.api.trips.intake.sights.$get({
            query: { q, session: session.current },
          }),
        );
        const body = searched.safeParse(await res.json().catch(() => null));
        if (mine === asked.current) setRemote(body.success ? body.data : null);
      } catch {
        if (mine === asked.current) setRemote(null);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, destinationsOnly]);

  const done = () => {
    setText("");
    setOpen(false);
    setRemote(null);
    setActive(0);
    session.current = crypto.randomUUID();
  };

  const options: Option[] = (() => {
    const towns = searchDestinations(q).map((d) => ({
      key: `d:${d.slug}`,
      title: d.name,
      detail: "Somewhere to spend a day",
      pick: () => {
        onDestination(d.slug);
        done();
      },
    }));
    if (destinationsOnly || !onSight || !remote) return towns;
    const sights = remote.sights.map((s) => ({
      key: `s:${s.id}`,
      title: s.name,
      detail: `Must-see in ${destinationName(s.place)}`,
      pick: () => {
        onSight(s);
        done();
      },
    }));
    const more = remote.more.map((s) => ({
      key: `g:${s.externalId}`,
      title: s.name,
      detail: s.where ? `${s.where} · from Google Maps` : "From Google Maps",
      pick: async () => {
        setBusy(s.name);
        setProblem(null);
        try {
          const res = await withGuestSession(() =>
            apiClient.api.trips.intake.sights.$post({
              json: { externalId: s.externalId, session: session.current },
            }),
          );
          const body = await res.json().catch(() => null);
          const ok = picked.safeParse(body);
          if (ok.success) {
            onSight(ok.data.sight);
            done();
          } else {
            const reason = refused.safeParse(body).data?.reason ?? "";
            setProblem(PICK_FAILED[reason] ?? "I couldn’t add that just now.");
          }
        } catch {
          setProblem("I couldn’t add that just now.");
        } finally {
          setBusy(null);
        }
      },
    }));
    return [...towns, ...sights, ...more];
  })();

  const shown = open && q.length > 0;
  const listId = `${id}-list`;

  return (
    <div className="relative">
      <div className="flex h-8 items-center gap-1.5 rounded-control border border-control bg-surface px-2 focus-within:border-agent">
        <Icon name="search" size={13} className="shrink-0 text-ink-faint" />
        <input
          type="search"
          aria-label={label}
          aria-controls={listId}
          // biome-ignore lint/a11y/noAutofocus: opened by the traveller's own tap
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          disabled={busy !== null}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(0);
            setProblem(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" && shown && options[active]) {
              e.preventDefault();
              void options[active].pick();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="w-44 min-w-0 bg-transparent text-mini outline-none placeholder:text-ink-faint"
        />
      </div>
      {busy ? (
        <span className="mt-1 block text-mini text-ink-muted">
          Adding {busy}…
        </span>
      ) : problem ? (
        <span role="alert" className="mt-1 block text-mini text-alert">
          {problem}
        </span>
      ) : null}
      {shown ? (
        <ul
          id={listId}
          aria-label={label}
          className="absolute left-0 top-9 z-20 flex max-h-72 w-72 max-w-[calc(100vw-32px)] flex-col overflow-y-auto rounded-control border border-control bg-surface py-1 shadow-lifted"
        >
          {options.length ? (
            options.map((o, i) => (
              <li key={o.key}>
                <button
                  type="button"
                  aria-current={i === active ? true : undefined}
                  // Keeps the input focused, so its blur does not close the
                  // list before the click lands.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void o.pick()}
                  onMouseEnter={() => setActive(i)}
                  className={cx(
                    "flex w-full flex-col px-3 py-1.5 text-left",
                    i === active && "bg-fill",
                  )}
                >
                  <span className="text-small font-medium">{o.title}</span>
                  <span className="text-mini text-ink-faint">{o.detail}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-1.5 text-mini text-ink-faint">
              {destinationsOnly || q.length < 2
                ? "No town or region by that name"
                : "Nothing by that name yet"}
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
