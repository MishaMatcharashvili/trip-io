"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Enrichment, Photo } from "@/domain/catalogue/enrichment";
import { apiClient } from "@/lib/hono-client";
import { SkeletonLine } from "@/ui/bars";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Eyebrow } from "@/ui/text";
import { PhotoViewer } from "./photo-viewer";
import {
  creditHref,
  EXCERPT_CHARS,
  excerpt,
  failureNote,
  reviewLine,
} from "./place-voices-model";

// What other people say about a place: a strip of pictures, and from each review
// source (src/infra/tripadvisor.ts, src/infra/google-places.ts) a rating and a few
// reviews, each under its own name.
//
// Three rules from the providers' terms shape this file:
//   * Reviews are fetched by script and drawn from state, never rendered into
//     the page, so they are never in its source.
//   * Nothing is kept in the browser: no module cache, no storage, and the
//     route answers `no-store`. The answer lives in this component's state while
//     it is on screen and goes with it. A place opened again is asked of the
//     server again; whether the server keeps it is its business (Redis).
//   * Every figure, picture and review says whose it is, and links back.
//
// What is spent is guarded here as well as on the server: nothing is asked for
// until the panel is near the screen, and then not until the traveller has
// stayed — a tap through a list of stops, or a pin tapped past on a map, never
// reaches the provider. A request still on its way is dropped when the panel
// goes. A failure is never retried by itself; the traveller asks.

/** How long the panel must be wanted before it is asked for. */
const SETTLE_MS = 400;
/** How far below the fold counts as near. */
const NEAR = "200px";

/** The review sources, each asked on its own: its terms, its limits, its failures. */
const SOURCES = ["tripadvisor", "google"] as const;
type Source = (typeof SOURCES)[number];

/** What a review provider said: reviews, nothing to say, or why it could not. */
type Reviews =
  | { kind: "ok"; enrichment: Enrichment }
  | { kind: "none" }
  | { kind: "failed"; reason: string };

type State =
  | { status: "waiting" }
  | { status: "loading" }
  | { status: "ready"; reviews: Reviews[]; photos: Photo[] };

async function askReviews(
  placeId: string,
  source: Source,
  signal: AbortSignal,
): Promise<Reviews> {
  try {
    const res = await apiClient.api.places[":id"].enrichment.$get(
      { param: { id: placeId }, query: { source } },
      { init: { signal } },
    );
    const body = (await res.json()) as
      | { ok: true; enrichment: Enrichment }
      | { ok: false; reason: string };
    if (body.ok) return { kind: "ok", enrichment: body.enrichment };
    return body.reason === "no-match" || body.reason === "not-configured"
      ? { kind: "none" }
      : { kind: "failed", reason: body.reason };
  } catch {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    // The answer was not JSON, or never came: the server, not the traveller.
    return { kind: "failed", reason: "upstream" };
  }
}

/** Photographs are free and independent of the reviews: a failure is simply none. */
async function askPhotos(
  placeId: string,
  signal: AbortSignal,
): Promise<Photo[]> {
  try {
    const res = await apiClient.api.places[":id"].photos.$get(
      { param: { id: placeId } },
      { init: { signal } },
    );
    const body = (await res.json()) as
      | { ok: true; photos: Photo[] }
      | { ok: false };
    return body.ok ? body.photos : [];
  } catch {
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    return [];
  }
}

export function PlaceVoices({
  placeId,
  name,
  className,
}: {
  placeId: string;
  name: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<State>({ status: "waiting" });
  // Bumped to ask again after a failure.
  const [attempt, setAttempt] = useState(0);
  // What each source has answered for this place, so a retry asks only the ones
  // that failed: an answer in hand is not paid for twice.
  const answered = useRef<{ placeId: string; by: Map<Source, Reviews> }>({
    placeId,
    by: new Map(),
  });

  // Near the screen, once. Not undone on scrolling away: the answer is already
  // here, and asking again would pay twice for it.
  useEffect(() => {
    const el = box.current;
    if (!el || near) return;
    const watcher = new IntersectionObserver(
      ([entry]) => entry?.isIntersecting && setNear(true),
      { rootMargin: NEAR },
    );
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [near]);

  // Wanted: debounced, then every source and the photographs asked at once, then
  // dropped if the panel goes first. `attempt` re-runs it for a retry; `placeId` for a different place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt only re-runs it
  useEffect(() => {
    if (!near) return;
    const controller = new AbortController();
    setState({ status: "waiting" });

    const timer = setTimeout(async () => {
      setState({ status: "loading" });
      if (answered.current.placeId !== placeId) {
        answered.current = { placeId, by: new Map() };
      }
      const { by } = answered.current;
      try {
        const [, photos] = await Promise.all([
          Promise.all(
            // Not yet asked, or failed: a source with nothing to say has said it.
            SOURCES.filter(
              (s) => (by.get(s)?.kind ?? "failed") === "failed",
            ).map(async (s) => {
              by.set(s, await askReviews(placeId, s, controller.signal));
            }),
          ),
          askPhotos(placeId, controller.signal),
        ]);
        setState({
          status: "ready",
          reviews: SOURCES.flatMap((s) => by.get(s) ?? []),
          photos,
        });
      } catch {
        // Dropped because the panel went: nothing to show.
      }
    }, SETTLE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [near, placeId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // The box is always there to be watched, and takes no room until it has
  // something to show.
  if (state.status === "ready") {
    const { reviews, photos } = state;
    const said = reviews.flatMap((r) => (r.kind === "ok" ? r.enrichment : []));
    const failure = reviews.find((r) => r.kind === "failed");
    const all = [
      ...said.flatMap((e) =>
        e.photos.map((p) => ({
          ...p,
          // A photograph that names its author keeps that; the rest are the
          // source's own.
          credit: p.credit ?? { text: e.source.name, url: e.url },
        })),
      ),
      ...photos,
    ];
    if (!said.length && !failure && all.length === 0) return <div ref={box} />;
    return (
      <div ref={box} className={className}>
        <Photos photos={all} name={name} />
        {said.map((enrichment) => (
          <Reviews
            key={enrichment.source.name}
            enrichment={enrichment}
            name={name}
          />
        ))}
        {failure ? <Failed reason={failure.reason} onRetry={retry} /> : null}
      </div>
    );
  }

  return (
    <div ref={box} className={className}>
      <Loading />
    </div>
  );
}

function Loading() {
  return (
    <div
      aria-busy="true"
      className="flex animate-breathe flex-col gap-3 px-[18px] py-3.5"
    >
      <span className="sr-only">Loading reviews</span>
      <SkeletonLine width="30%" />
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-[112px] w-[150px] shrink-0 rounded-[9px] bg-track"
          />
        ))}
      </div>
      <SkeletonLine width="80%" />
      <SkeletonLine width="64%" />
    </div>
  );
}

function Failed({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  const note = failureNote(reason);
  return (
    <div className="flex items-center gap-3 px-[18px] py-3.5">
      <span className="flex-1 text-small text-ink-faint">{note.text}</span>
      {note.canRetry ? (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One photograph in the strip: the source's smaller version, which is what a
 * 150px slot wants, falling back to the full one if the smaller will not load,
 * and giving up (so the strip closes the gap) only when neither does.
 */
function PhotoTile({
  photo,
  alt,
  label,
  onOpen,
  onBroken,
}: {
  photo: Photo;
  alt: string;
  label: string;
  onOpen: () => void;
  onBroken: () => void;
}) {
  const [full, setFull] = useState(!photo.preview);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="cursor-zoom-in rounded-[9px]"
    >
      <Image
        src={full ? photo.url : (photo.preview ?? photo.url)}
        alt={alt}
        unoptimized={photo.unoptimized}
        // The optimiser resizes to this slot (and its 2x), as WebP or AVIF,
        // from the smaller version where there is one: it is the original it
        // would otherwise have to download.
        width={150}
        height={112}
        sizes="150px"
        onError={() => (full ? onBroken() : setFull(true))}
        className="h-[112px] w-[150px] rounded-[9px] bg-track object-cover"
      />
    </button>
  );
}

/** Photographs, each with who took it: the licence asks for the credit, and so does the review site's. */
function Photos({ photos, name }: { photos: Photo[]; name: string }) {
  // A photograph that will not load (a host that changed, a file taken down)
  // leaves no hole in the strip.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  // Which photograph is open full screen, if any.
  const [open, setOpen] = useState<number | null>(null);
  const shown = photos.filter((p) => !broken.has(p.id));
  if (shown.length === 0) return null;
  return (
    <section
      aria-label={`Photos of ${name}`}
      className="flex flex-col gap-2 border-b border-hairline px-[18px] py-3.5"
    >
      <Eyebrow>Photos</Eyebrow>
      <ul className="-mx-[18px] flex gap-2.5 overflow-x-auto px-[18px] pb-1">
        {shown.map((photo, i) => (
          <li key={photo.id} className="flex w-[150px] shrink-0 flex-col gap-1">
            <PhotoTile
              photo={photo}
              alt={photo.caption ?? `A photo of ${name}`}
              label={`Open photo ${i + 1} of ${shown.length} full screen`}
              onOpen={() => setOpen(i)}
              onBroken={() => setBroken((prev) => new Set(prev).add(photo.id))}
            />
            {photo.credit ? (
              <a
                href={creditHref(photo.credit, name)}
                target="_blank"
                rel="noreferrer noopener"
                title={photo.credit.text}
                className="truncate text-micro text-ink-faint hover:text-ink"
              >
                {photo.credit.text}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      {open !== null ? (
        <PhotoViewer
          photos={shown}
          index={Math.min(open, shown.length - 1)}
          name={name}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}

/** The review site's rating and reviews, each saying whose it is and linking back. */
function Reviews({
  enrichment,
  name,
}: {
  enrichment: Enrichment;
  name: string;
}) {
  const { rating, ranking, reviews, source, url } = enrichment;
  if (!rating && !reviews.length) return null;

  return (
    <section
      aria-label={`${source.name} reviews of ${name}`}
      className="flex flex-col gap-3 border-b border-hairline px-[18px] py-3.5"
    >
      <div className="flex items-center gap-2">
        <Eyebrow>On {source.name}</Eyebrow>
        <div className="flex-1" />
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-mini font-medium text-agent"
        >
          See all on {source.name}
        </a>
      </div>

      {rating ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-2 self-start"
        >
          {rating.icon ? (
            // biome-ignore lint/performance/noImgElement: the provider's own rating graphic, drawn as supplied
            <img
              src={rating.icon}
              alt={`${rating.value} of 5`}
              height={16}
              referrerPolicy="no-referrer"
              className="h-4 w-auto"
            />
          ) : (
            <span className="text-small font-semibold">{rating.value}/5</span>
          )}
          <span className="text-small text-ink-muted">
            {rating.count.toLocaleString("en-GB")} reviews
          </span>
        </a>
      ) : null}
      {ranking ? <p className="text-mini text-ink-faint">{ranking}</p> : null}

      {reviews.length ? (
        <ul className="flex flex-col">
          {reviews.map((review, i) => (
            <li
              key={review.id}
              className={cx(
                "flex flex-col gap-1 py-2.5",
                i > 0 && "border-t border-track",
              )}
            >
              <div className="flex items-center gap-2">
                {review.ratingIcon ? (
                  // biome-ignore lint/performance/noImgElement: the provider's own rating graphic, drawn as supplied
                  <img
                    src={review.ratingIcon}
                    alt={`${review.rating} of 5`}
                    height={14}
                    referrerPolicy="no-referrer"
                    className="h-3.5 w-auto"
                  />
                ) : (
                  <span className="text-mini font-semibold">
                    {review.rating}/5
                  </span>
                )}
                {review.title ? (
                  <span className="min-w-0 flex-1 truncate text-small font-medium">
                    {review.title}
                  </span>
                ) : null}
              </div>
              <p className="text-small text-ink-muted">
                {excerpt(review.text)}
                {review.text.length > EXCERPT_CHARS ? (
                  <>
                    {" "}
                    <a
                      href={review.url ?? url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-agent"
                    >
                      Read more
                    </a>
                  </>
                ) : null}
              </p>
              <span className="text-mini text-ink-faint">
                {reviewLine(review)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
