"use client";

import { useEffect, useRef, useState } from "react";
import type { AreaProgress, QueuePlace } from "@/bll/curation";
import {
  type CategoryGroup,
  categoryGroups,
} from "@/domain/catalogue/categories";
import {
  curatedTarget,
  type FocusAreaSlug,
  focusAreas,
} from "@/domain/catalogue/focus-areas";
import type { PlaceInput } from "@/domain/catalogue/review-input";
import { apiClient } from "@/lib/hono-client";
import { draftFromPlace, emptyDraft } from "./draft";
import { Evidence, humanise } from "./evidence";
import { PlaceForm } from "./place-form";

const api = apiClient.api.curation;

async function expectOk(res: Response) {
  if (res.ok) return;
  if (res.status === 401 || res.status === 403) {
    throw new Error("Session expired or not a curator — reload the page.");
  }
  const body = await res.text();
  throw new Error(`${res.status}: ${body.slice(0, 300)}`);
}

export function CurationQueue() {
  const [area, setArea] = useState<FocusAreaSlug>(focusAreas[0].slug);
  const [group, setGroup] = useState<CategoryGroup | null>(null);
  const [mode, setMode] = useState<"review" | "add">("review");

  const [progress, setProgress] = useState<AreaProgress[] | null>(null);
  const [places, setPlaces] = useState<QueuePlace[] | null>(null);
  const [pending, setPending] = useState(0);
  // Resets the add form after each successful add.
  const [added, setAdded] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Switching area or group while a queue request is in flight must not let the
  // older response land last.
  const queueRequest = useRef(0);

  async function loadQueue(area: FocusAreaSlug, group: CategoryGroup | null) {
    const request = ++queueRequest.current;
    setPlaces(null);
    try {
      const res = await api.queue.$get({
        query: group ? { area, group } : { area },
      });
      await expectOk(res);
      const data = await res.json();
      if (request !== queueRequest.current || !("places" in data)) return;
      setPlaces(data.places as QueuePlace[]);
      setPending(data.pending);
    } catch (err) {
      if (request === queueRequest.current) setError((err as Error).message);
    }
  }

  async function loadProgress() {
    try {
      const res = await api.progress.$get();
      await expectOk(res);
      const data = await res.json();
      if ("areas" in data) setProgress(data.areas as AreaProgress[]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadQueue is recreated each render; area and group are its real inputs
  useEffect(() => {
    loadQueue(area, group);
  }, [area, group]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount, then after each decision
  useEffect(() => {
    loadProgress();
  }, []);

  // Synchronous guard: `busy` only disables buttons after a re-render, so two
  // fast submits could both get through.
  const inFlight = useRef(false);

  // "reviewed" and "skipped" both move to the next candidate; only a review
  // takes it out of the pending count.
  async function run(
    label: string,
    action: () => Promise<Response>,
    outcome:
      | { kind: "reviewed" | "skipped"; placeId: string }
      | { kind: "added" },
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    // If the area or group changes while the request is out, the list on
    // screen belongs to another view and this result must not touch it.
    const view = queueRequest.current;
    setBusy(true);
    setError(null);
    try {
      await expectOk(await action());
      setFlash(label);
      loadProgress();
      if (outcome.kind === "added") {
        setAdded((n) => n + 1);
      } else if (view === queueRequest.current && places) {
        const rest = places.filter((p) => p.id !== outcome.placeId);
        setPlaces(rest);
        if (outcome.kind === "reviewed") {
          setPending((n) => Math.max(0, n - 1));
        }
        // Refetch rather than page: skipped places come back at the end.
        if (rest.length === 0) loadQueue(area, group);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const current = places?.[0];

  const review = (
    body: Parameters<(typeof api.places)[":id"]["review"]["$post"]>[0]["json"],
  ) =>
    current &&
    run(
      body.decision === "curate"
        ? `Curated ${body.place.name}`
        : `${body.decision === "skip" ? "Skipped" : "Rejected"} ${current.name}`,
      () =>
        api.places[":id"].review.$post({
          param: { id: current.id },
          json: body,
        }),
      {
        kind: body.decision === "skip" ? "skipped" : "reviewed",
        placeId: current.id,
      },
    );

  const totalCurated = progress?.reduce((sum, a) => sum + a.curated, 0) ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Catalogue curation</h1>
        <p className="text-sm text-zinc-500">
          {progress ? `${totalCurated} / ${curatedTarget} curated` : "…"}
        </p>
      </header>

      <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {focusAreas.map((a) => {
          const p = progress?.find((x) => x.slug === a.slug);
          const pct = p ? Math.min(100, (p.curated / a.target) * 100) : 0;
          return (
            <button
              key={a.slug}
              type="button"
              onClick={() => {
                setArea(a.slug);
                setMode("review");
              }}
              className={`flex flex-col gap-1.5 rounded-lg border p-3 text-left ${
                area === a.slug
                  ? "border-foreground"
                  : "border-zinc-200 dark:border-zinc-800"
              }`}
            >
              <span className="font-medium">{a.name}</span>
              <span className="h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                <span
                  className="block h-full bg-emerald-600"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <span className="text-xs text-zinc-500">
                {p
                  ? `${p.curated} / ${a.target} · ${p.pending} to review`
                  : "…"}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [null, ...Object.keys(categoryGroups)] as (CategoryGroup | null)[]
        ).map((g) => (
          <button
            key={g ?? "all"}
            type="button"
            onClick={() => {
              setGroup(g);
              setMode("review");
            }}
            className={`rounded-full border px-3 py-1 text-sm ${
              group === g && mode === "review"
                ? "border-foreground bg-foreground text-background"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
          >
            {g ? humanise(g) : "All"}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMode(mode === "add" ? "review" : "add")}
          className={`ml-auto rounded-full border px-3 py-1 text-sm ${
            mode === "add"
              ? "border-foreground bg-foreground text-background"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        >
          + Add a place Overture is missing
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {flash && !error && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          ✓ {flash}
        </p>
      )}

      {mode === "add" ? (
        <section className="max-w-2xl">
          <PlaceForm
            key={`add-${added}`}
            initial={emptyDraft()}
            busy={busy}
            submitLabel="Add as curated"
            onCurate={(input: PlaceInput) =>
              run(
                `Added ${input.name}`,
                () => api.places.$post({ json: input }),
                { kind: "added" },
              )
            }
          />
        </section>
      ) : places === null ? (
        <p className="text-zinc-500">Loading queue…</p>
      ) : !current ? (
        <p className="text-zinc-500">
          Nothing left to review here{group ? ` in ${humanise(group)}` : ""}.
        </p>
      ) : (
        <>
          <p className="text-sm text-zinc-500">
            {pending} to review in this view
          </p>
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
            <Evidence place={current} />
            <PlaceForm
              key={current.id}
              initial={draftFromPlace(current)}
              busy={busy}
              submitLabel="Curate"
              onCurate={(place) => review({ decision: "curate", place })}
              onSkip={(note) => review({ decision: "skip", note })}
              onReject={(note) => review({ decision: "reject", note })}
            />
          </div>
        </>
      )}
    </main>
  );
}
