"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Checkpoint } from "@/data/trip";
import { apiClient } from "@/lib/hono-client";
import { Button } from "@/ui/button";
import { Card, Divider } from "@/ui/card";
import { cx } from "@/ui/cx";
import { TextField } from "@/ui/field";
import { Icon } from "@/ui/icon";
import { Eyebrow, Num } from "@/ui/text";
import { CheckpointRow } from "./itinerary";
import { UndoButton } from "./trip-actions";

// Editing a day. Every change is one patch against the head the page was read
// at: the server validates the whole day again, refuses what would break it,
// and answers "stale" when the plan moved elsewhere — then the page is read
// again rather than merged here.

type PatchOp =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown };

type Hit = {
  id: string;
  name: string;
  category: string;
  group: string;
  tier: string;
  outdoor: boolean;
  distanceM: number | null;
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
  stop,
  date,
  onSave,
  onRemove,
  onCancel,
  pending,
}: {
  stop: Checkpoint;
  date: string;
  onSave: (startsAt: string, durationMin: number) => void;
  onRemove: () => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const node = stop.node;
  const [time, setTime] = useState(node ? clock(node.startsAt) : "09:00");
  const [minutes, setMinutes] = useState(String(node?.durationMin ?? 60));

  return (
    <form
      className="flex flex-col gap-3 bg-canvas px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(instant(date, time), Number(minutes));
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
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
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

function AddStop({
  date,
  near,
  pending,
  onAdd,
  onClose,
}: {
  date: string;
  near: [number, number] | null;
  pending: boolean;
  onAdd: (
    hit: Hit,
    kind: "visit" | "meal",
    time: string,
    minutes: number,
  ) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [time, setTime] = useState("12:00");
  const [minutes, setMinutes] = useState("60");

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
            onAdd(picked, kind, time, Number(minutes));
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
                    onClick={() => setPicked(hit)}
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
  openAdd = false,
}: {
  tripId: string;
  head: string | null;
  date: string;
  stops: Checkpoint[];
  near: [number, number] | null;
  openAdd?: boolean;
}) {
  const { send, pending, error } = usePatch(tripId, head);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(openAdd);

  return (
    <div className="flex flex-col gap-3">
      <Card className="overflow-hidden">
        {stops.length === 0 ? (
          <p className="px-4 py-3 text-small text-ink-faint">
            Nothing planned this day yet.
          </p>
        ) : null}
        {stops.map((stop, i) => (
          <div key={stop.id}>
            {i > 0 ? <Divider /> : null}
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
                stop={stop}
                date={date}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(startsAt, durationMin) =>
                  send(
                    `Moved ${stop.title} to ${clock(startsAt)}`,
                    [
                      {
                        op: "replace",
                        path: `/nodes/${stop.id}/startsAt`,
                        value: startsAt,
                      },
                      {
                        op: "replace",
                        path: `/nodes/${stop.id}/durationMin`,
                        value: durationMin,
                      },
                    ],
                    () => setEditing(null),
                  )
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
          pending={pending}
          onClose={() => setAdding(false)}
          onAdd={(hit, kind, time, minutes) => {
            const title =
              kind === "meal" ? `${mealTitle(time)} · ${hit.name}` : hit.name;
            send(
              `Added ${title}`,
              [
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
