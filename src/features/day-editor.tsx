"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Checkpoint } from "@/data/trip";
import type { LonLat } from "@/domain/geo";
import { suggestSlot } from "@/domain/trip/slot";
import { straightLineTravel } from "@/domain/trip/travel";
import { apiClient } from "@/lib/hono-client";
import { Button } from "@/ui/button";
import { Card, Divider } from "@/ui/card";
import { cx } from "@/ui/cx";
import { TextField } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { Eyebrow, Num } from "@/ui/text";
import type { Gap, ProblemView } from "./day-timing";
import { CheckpointRow } from "./itinerary";
import { UndoButton } from "./trip-actions";
import { duration } from "./trip-model";

// Editing a day. Every change is one patch against the head the page was read
// at: the server validates the whole day again, refuses what would break it,
// and answers "stale" when the plan moved elsewhere — then the page is read
// again rather than merged here.

type PatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }
  | { op: "test"; path: string; value: unknown };

type Hit = {
  id: string;
  name: string;
  category: string;
  group: string;
  tier: string;
  outdoor: boolean;
  lonLat: LonLat | null;
  distanceM: number | null;
};

/** What /retime answers: the edit's ops, what it pushes, and what is left wrong. */
type Preview = {
  ops: PatchOp[];
  pushed: { id: string; title: string; from: string; to: string }[];
  overflow: boolean;
  remaining: { message: string }[];
};

/** An instant from a Tbilisi date and wall-clock time. */
const instant = (date: string, hhmm: string) =>
  new Date(`${date}T${hhmm}:00+04:00`).toISOString();

const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

const mealTitle = (hhmm: string) => {
  const hour = Number(hhmm.slice(0, 2));
  return hour < 11
    ? "Breakfast"
    : hour < 16
      ? "Lunch"
      : hour < 18
        ? "Coffee"
        : "Dinner";
};

function usePatch(tripId: string, head: string | null) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const send = (intent: string, ops: PatchOp[], done?: () => void) =>
    start(async () => {
      setError(null);
      const res = await apiClient.api.trips[":id"].patches.$post({
        param: { id: tripId },
        json: { parentId: head, intent, ops: ops as never },
      });
      if (res.ok) {
        done?.();
      } else {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          blocking?: { message: string }[];
          violations?: { message: string }[];
          message?: string;
        } | null;
        setError(
          body?.error === "stale"
            ? "Your plan changed somewhere else. Here it is again — try once more."
            : (body?.blocking?.[0]?.message ??
                body?.violations?.[0]?.message ??
                body?.message ??
                "That change didn’t go through."),
        );
      }
      router.refresh();
    });

  return { send, pending, error };
}

function StopEditor({
  tripId,
  stop,
  date,
  onSave,
  onRemove,
  onCancel,
  pending,
}: {
  tripId: string;
  stop: Checkpoint;
  date: string;
  /** The ops to apply: the edit, with the later stops it pushes when asked to. */
  onSave: (ops: PatchOp[], intent: string) => void;
  onRemove: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const node = stop.node;
  const [time, setTime] = useState(node ? clock(node.startsAt) : "09:00");
  const [minutes, setMinutes] = useState(String(node?.durationMin ?? 60));
  const [shift, setShift] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(false);

  const length = Number(minutes);
  const valid = Number.isInteger(length) && length >= 5 && length <= 720;
  const moved = node ? clock(node.startsAt) !== time : false;
  const resized = node ? node.durationMin !== length : false;
  const changed = moved || resized;
  const endsAt = valid
    ? clock(
        new Date(
          Date.parse(instant(date, time)) + length * 60_000,
        ).toISOString(),
      )
    : null;

  // What this edit would push, asked of the server (which knows the whole day
  // and the way between its stops) once the traveller has stopped typing. A
  // keystroke does not ask; a stale answer is dropped when a new one is wanted.
  useEffect(() => {
    if (!changed || !valid) {
      setPreview(null);
      setChecking(false);
      return;
    }
    const controller = new AbortController();
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await apiClient.api.trips[":id"].retime.$post(
          {
            param: { id: tripId },
            json: {
              nodeId: stop.id,
              startsAt: instant(date, time),
              durationMin: length,
            },
          },
          { init: { signal: controller.signal } },
        );
        setPreview(res.ok ? ((await res.json()) as Preview) : null);
      } catch {
        if (!controller.signal.aborted) setPreview(null);
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [changed, valid, tripId, stop.id, date, time, length]);

  const pushes = preview?.pushed.length ?? 0;
  const baseOps: PatchOp[] = [
    ...(moved
      ? [
          {
            op: "replace" as const,
            path: `/nodes/${stop.id}/startsAt`,
            value: instant(date, time),
          },
        ]
      : []),
    ...(resized
      ? [
          {
            op: "replace" as const,
            path: `/nodes/${stop.id}/durationMin`,
            value: length,
          },
        ]
      : []),
  ];
  const useShift = shift && pushes > 0 && preview;
  const intent = `${
    moved
      ? `Moved ${stop.title} to ${time}`
      : `Changed ${stop.title} to ${duration(length)}`
  }${useShift ? `, shifted ${pushes} later stop${pushes === 1 ? "" : "s"}` : ""}`;

  return (
    <form
      className="flex flex-col gap-3 bg-canvas px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!changed || !valid) return onCancel();
        onSave(useShift && preview ? preview.ops : baseOps, intent);
      }}
    >
      <Eyebrow>Change “{stop.title}”</Eyebrow>
      <div className="flex gap-3">
        <TextField
          label="Starts"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          required
          className="flex-1"
        />
        <TextField
          label="Minutes"
          type="number"
          min={5}
          max={720}
          step={5}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          required
          className="flex-1"
          hint={endsAt ? `Ends ${endsAt}` : undefined}
        />
      </div>

      {checking ? (
        <p className="text-mini text-ink-faint">
          Checking the rest of the day…
        </p>
      ) : null}

      {!checking && pushes > 0 && preview ? (
        <div className="flex flex-col gap-2 rounded-control border border-hairline bg-surface px-3 py-2.5">
          <div className="text-small font-medium">
            This pushes {pushes} later stop{pushes === 1 ? "" : "s"}
          </div>
          <ul className="flex flex-col gap-0.5">
            {preview.pushed.map((p) => (
              <li key={p.id} className="flex gap-2 text-mini text-ink-muted">
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <Num>
                  {clock(p.from)} → {clock(p.to)}
                </Num>
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-small">
            <input
              type="checkbox"
              checked={shift}
              onChange={(e) => setShift(e.target.checked)}
            />
            Move them to make room
          </label>
        </div>
      ) : null}

      {!checking && preview?.overflow ? (
        <p className="text-mini text-alert">
          Making room would push stops past the end of the day, so only this one
          changes.
        </p>
      ) : null}

      {!checking && preview && preview.remaining.length > 0 ? (
        <ul className="flex flex-col gap-1 text-mini text-alert">
          {preview.remaining.slice(0, 3).map((v) => (
            <li key={v.message}>{v.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={pending || checking || !valid}
        >
          Save
        </Button>
        <Button size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={pending}
          className="text-alert hover:text-alert"
        >
          Remove stop
        </Button>
      </div>
    </form>
  );
}

type Drive = { startsAt: string; durationMin: number };

/** The last stop of a day so far: when it ends and where, for the next to follow. */
function lastOf(stops: Checkpoint[]) {
  let last: { endsAt: number; at: LonLat | null; title: string } | null = null;
  for (const stop of stops) {
    if (!stop.node) continue;
    const endsAt =
      Date.parse(stop.node.startsAt) + stop.node.durationMin * 60_000;
    if (!last || endsAt > last.endsAt) {
      last = { endsAt, at: stop.node.lonLat, title: stop.title };
    }
  }
  return last;
}

function AddStop({
  date,
  near,
  stops,
  pending,
  initialQuery = "",
  onAdd,
  onClose,
}: {
  date: string;
  initialQuery?: string;
  near: [number, number] | null;
  /** The day so far, for the new stop to go after. */
  stops: Checkpoint[];
  pending: boolean;
  onAdd: (
    hit: Hit,
    kind: "visit" | "meal",
    time: string,
    minutes: number,
    drive: Drive | null,
  ) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState(initialQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [time, setTime] = useState("12:00");
  const [minutes, setMinutes] = useState("60");
  // A drive to add with the stop, when it is too far from the last to walk to.
  const [drive, setDrive] = useState<Drive | null>(null);
  const last = lastOf(stops);

  // Where the stop goes and for how long, as a first guess for the traveller to
  // change: after the last stop with the way there allowed for, for as long as
  // that kind of place usually takes. Not noon for an hour whatever it is.
  const pick = (hit: Hit) => {
    const slot = suggestSlot(
      {
        day: date,
        last: last && { endsAt: last.endsAt, at: last.at },
        place: { lonLat: hit.lonLat, category: hit.category },
      },
      straightLineTravel,
    );
    setPicked(hit);
    setTime(clock(slot.startsAt));
    setMinutes(String(slot.durationMin));
    setDrive(slot.transfer ?? null);
  };

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const res = await apiClient.api.places.$get({
        query: {
          q,
          near: near ? `${near[0]},${near[1]}` : undefined,
          limit: "8",
        },
      });
      setSearching(false);
      if (res.ok) setHits((await res.json()).places as Hit[]);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, near]);

  const kind = picked?.group === "food" ? "meal" : "visit";

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center">
        <Eyebrow tone="agent">Add a stop · {date}</Eyebrow>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="text-ink-faint hover:text-ink"
        >
          <Icon name="close" size={15} />
        </button>
      </div>

      {picked ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onAdd(picked, kind, time, Number(minutes), drive);
          }}
        >
          <div className="flex items-center gap-2 rounded-control bg-agent-tint px-3 py-2">
            <span className="flex-1 text-small font-medium">
              {kind === "meal" ? `${mealTitle(time)} · ` : ""}
              {picked.name}
            </span>
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-mini text-agent"
            >
              Change
            </button>
          </div>
          <div className="flex gap-3">
            <TextField
              label="Starts"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              required
              className="flex-1"
            />
            <TextField
              label="Minutes"
              type="number"
              min={5}
              max={720}
              step={5}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              required
              className="flex-1"
            />
          </div>
          {drive && last ? (
            <p className="text-mini text-ink-muted">
              Too far to walk from {last.title}: this adds a{" "}
              {duration(drive.durationMin)} drive first, leaving at{" "}
              {clock(drive.startsAt)}.
            </p>
          ) : null}
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Adding…" : "Add to the day"}
          </Button>
        </form>
      ) : (
        <>
          <TextField
            label="Search places"
            placeholder="Narikala, Fabrika, a café…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
            hint={searching ? "Searching…" : "Nearest to this day first"}
          />
          {hits.length ? (
            <div className="flex flex-col overflow-hidden rounded-control border border-hairline">
              {hits.map((hit, i) => (
                <div key={hit.id}>
                  {i > 0 ? <Divider /> : null}
                  <button
                    type="button"
                    onClick={() => pick(hit)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas"
                  >
                    <span className="flex-1">
                      <span className="block text-small font-medium">
                        {hit.name}
                      </span>
                      <span className="block text-mini text-ink-faint">
                        {hit.category.replace(/_/g, " ")}
                        {hit.tier === "curated" ? " · hand-checked" : ""}
                      </span>
                    </span>
                    {hit.distanceM !== null ? (
                      <Num className="text-mini text-ink-faint">
                        {hit.distanceM < 1000
                          ? `${Math.round(hit.distanceM)} m`
                          : `${(hit.distanceM / 1000).toFixed(1)} km`}
                      </Num>
                    ) : null}
                  </button>
                </div>
              ))}
            </div>
          ) : q.trim().length >= 2 && !searching ? (
            <p className="text-small text-ink-faint">Nothing by that name.</p>
          ) : null}
        </>
      )}
    </Card>
  );
}

export function DayEditor({
  tripId,
  head,
  date,
  stops,
  near,
  problems = [],
  gaps = {},
  openAdd = false,
  initialQuery,
}: {
  tripId: string;
  head: string | null;
  date: string;
  stops: Checkpoint[];
  near: [number, number] | null;
  /** What is wrong with this day's times, each with the shift that fixes it. */
  problems?: ProblemView[];
  /** The note before a stop, keyed by that stop's id: the way and the room. */
  gaps?: Record<string, Gap>;
  openAdd?: boolean;
  /** A place to look for as the add panel opens: "add to trip" from Explore. */
  initialQuery?: string;
}) {
  const { send, pending, error } = usePatch(tripId, head);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(openAdd);

  return (
    <div className="flex flex-col gap-3">
      {problems.length > 0 ? (
        <Card tint accent="alert" className="flex flex-col gap-2.5 px-3.5 py-3">
          <Eyebrow tone="alert">
            {problems.length === 1
              ? "Something about this day's times"
              : `${problems.length} things about this day's times`}
          </Eyebrow>
          {problems.map((problem) => (
            <div key={problem.id} className="flex flex-col gap-1.5">
              <p className="text-small">{problem.message}</p>
              {problem.fix ? (
                <div className="flex flex-col gap-1.5">
                  <ul className="flex flex-col gap-0.5">
                    {problem.fix.moves.map((move) => (
                      <li key={move} className="text-mini text-ink-muted">
                        {move}
                      </li>
                    ))}
                  </ul>
                  <div>
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        send(problem.fix?.label ?? "", problem.fix?.ops ?? [])
                      }
                    >
                      {problem.fix.label}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        {stops.length === 0 ? (
          <p className="px-4 py-3 text-small text-ink-faint">
            Nothing planned this day yet.
          </p>
        ) : null}
        {stops.map((stop, i) => (
          <div key={stop.id}>
            {i > 0 ? (
              gaps[stop.id] ? (
                <div
                  className={cx(
                    "flex items-center gap-1.5 border-y border-hairline px-4 py-1 text-mini",
                    gaps[stop.id]?.tone === "alert"
                      ? "bg-alert-tint text-alert"
                      : "bg-surface-subtle text-ink-faint",
                  )}
                >
                  <Icon name="arrowRight" size={11} className="rotate-90" />
                  {gaps[stop.id]?.text}
                </div>
              ) : (
                <Divider />
              )
            ) : null}
            <div className="flex items-stretch">
              <CheckpointRow
                checkpoint={stop}
                href={`/trips/${tripId}/place/${stop.id}`}
                className="flex-1"
              />
              <button
                type="button"
                aria-label={`Change ${stop.title}`}
                onClick={() => setEditing(editing === stop.id ? null : stop.id)}
                className={cx(
                  "px-3 text-mini font-medium transition-colors hover:text-ink",
                  editing === stop.id ? "text-agent" : "text-ink-faint",
                )}
              >
                Edit
              </button>
            </div>
            {editing === stop.id ? (
              <StopEditor
                tripId={tripId}
                stop={stop}
                date={date}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(ops, intent) =>
                  send(intent, ops, () => setEditing(null))
                }
                onRemove={() =>
                  send(
                    `Removed ${stop.title}`,
                    [{ op: "remove", path: `/nodes/${stop.id}` }],
                    () => setEditing(null),
                  )
                }
              />
            ) : null}
          </div>
        ))}
      </Card>

      {error ? (
        <p className="rounded-control bg-alert-tint px-3 py-2 text-small text-alert">
          {error}
        </p>
      ) : null}

      {adding ? (
        <AddStop
          date={date}
          near={near}
          stops={stops}
          initialQuery={initialQuery}
          pending={pending}
          onClose={() => setAdding(false)}
          onAdd={(hit, kind, time, minutes, drive) => {
            const title =
              kind === "meal" ? `${mealTitle(time)} · ${hit.name}` : hit.name;
            send(
              `Added ${title}`,
              [
                // Too far to walk to: the drive goes in first, ending where the
                // stop starts.
                ...(drive && hit.lonLat
                  ? [
                      {
                        op: "add" as const,
                        path: `/nodes/${crypto.randomUUID()}`,
                        value: {
                          kind: "transfer",
                          placeId: null,
                          lonLat: hit.lonLat,
                          startsAt: drive.startsAt,
                          durationMin: drive.durationMin,
                          indoor: false,
                          meta: { title: `Drive to ${hit.name}`, urban: false },
                        },
                      },
                    ]
                  : []),
                {
                  op: "add",
                  path: `/nodes/${crypto.randomUUID()}`,
                  value: {
                    kind,
                    placeId: hit.id,
                    lonLat: null,
                    startsAt: instant(date, time),
                    durationMin: minutes,
                    indoor: !hit.outdoor,
                    meta: { title, urban: false },
                  },
                },
              ],
              () => setAdding(false),
            );
          }}
        />
      ) : null}

      <div className="flex gap-2.5 pt-1">
        {adding ? null : (
          <Button
            className="flex-1 lg:flex-none"
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" size={14} />
            Add a stop
          </Button>
        )}
        {head ? (
          <UndoButton tripId={tripId} label="Undo last change" size="md" />
        ) : null}
      </div>
    </div>
  );
}
