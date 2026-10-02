"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Enrichment } from "@/domain/catalogue/enrichment";
import { apiClient } from "@/lib/hono-client";
import { SkeletonLine } from "@/ui/bars";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Eyebrow } from "@/ui/text";
import {
  EXCERPT_CHARS,
  excerpt,
  failureNote,
  reviewLine,
} from "./place-voices-model";

// What other people say about a place: a rating, a strip of pictures, a few
// reviews, from the provider (src/infra/tripadvisor.ts).
//
// Three rules from the provider's terms shape this file:
//   * Reviews are fetched by script and drawn from state, never rendered into
//     the page, so they are never in its source.
//   * Nothing is kept. There is no cache here, in a module or in storage: the
//     answer lives in this component's state while it is on screen and goes
//     with it. A place opened again is asked for again.
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

type State =
  | { status: "waiting" }
  | { status: "loading" }
  | { status: "ready"; enrichment: Enrichment }
  // Nothing to show, and nothing to say about it.
  | { status: "empty" }
  | { status: "failed"; reason: string };

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

  // Wanted: debounced, then fetched, then dropped if the panel goes first.
  // `attempt` re-runs it for a retry; `placeId` for a different place.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt only re-runs it
  useEffect(() => {
    if (!near) return;
    const controller = new AbortController();
    setState({ status: "waiting" });

    const timer = setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const res = await apiClient.api.places[":id"].enrichment.$get(
          { param: { id: placeId } },
          { init: { signal: controller.signal } },
        );
        const body = (await res.json()) as
          | { ok: true; enrichment: Enrichment }
          | { ok: false; reason: string };
        if (body.ok) {
          setState({ status: "ready", enrichment: body.enrichment });
        } else if (
          body.reason === "no-match" ||
          body.reason === "not-configured"
        ) {
          setState({ status: "empty" });
        } else {
          setState({ status: "failed", reason: body.reason });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "failed",
          reason: error instanceof Error ? "timeout" : "upstream",
        });
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
  if (state.status === "empty") return <div ref={box} />;

  return (
    <div ref={box} className={className}>
      {state.status === "waiting" || state.status === "loading" ? (
        <Loading />
      ) : state.status === "failed" ? (
        <Failed reason={state.reason} onRetry={retry} />
      ) : (
        <Ready enrichment={state.enrichment} name={name} />
      )}
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

function Ready({ enrichment, name }: { enrichment: Enrichment; name: string }) {
  const { rating, ranking, reviews, photos, source, url } = enrichment;
  if (!rating && !reviews.length && !photos.length) return null;

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

      {photos.length ? (
        <ul className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] pb-1">
          {photos.map((photo) => (
            <li key={photo.id} className="shrink-0">
              {/* biome-ignore lint/performance/noImgElement: the provider's own CDN, which must serve it; it may not be copied through ours */}
              <img
                src={photo.url}
                alt={photo.caption ?? `A photo of ${name}`}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                width={150}
                height={112}
                className="h-[112px] w-[150px] rounded-[9px] bg-track object-cover"
              />
            </li>
          ))}
        </ul>
      ) : null}

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
