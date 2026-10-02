import Link from "next/link";
import type { Trip } from "@/data/trip";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import type { MapStop } from "@/ui/map/trip-map";
import { Headline, Prose } from "@/ui/text";
import { RoutedTripMap } from "./routed-trip-map";
import { dayHref } from "./trip-links";
import type { TripState } from "./trip-picker-model";

// The trip the landing page opens on: a map of it, what it is, what state the
// watch is in, and the one thing to do next. One card for a trip under way, one
// still being planned and one that is over, because a returning traveller opens
// the app for the trip they have, whichever it is — and what they want of it
// differs: today for one, whether it is watched for another.

export type Hero = {
  trip: Trip;
  stops: MapStop[];
  state: TripState;
  /** "Starts in 8 days", for an upcoming trip. */
  startsIn?: string;
  /** The decision waiting on the traveller, when there is one. */
  decision: { title: string; detail: string; href: string } | null;
  detectors: { name: string; tone: "ok" | "alert" | "idle" }[];
  /** Watching is switched on for this trip. */
  watched: boolean;
  /** Changes the traveller applied: "4 changes handled". */
  applied: number;
  example?: boolean;
};

function StatusLine({ hero }: { hero: Hero }) {
  const { decision, state, watched } = hero;

  if (state === "finished") {
    return (
      <div className="flex items-center gap-2 bg-canvas px-3.5 py-2.5">
        <Dot tone="idle" />
        <span className="text-small text-ink-muted">
          {hero.applied === 0
            ? "No changes were needed"
            : `${hero.applied} change${hero.applied === 1 ? "" : "s"} handled`}
        </span>
      </div>
    );
  }
  if (!watched && !hero.example) {
    return (
      <div className="flex items-center gap-2 bg-canvas px-3.5 py-2.5">
        <Dot tone="idle" />
        <span className="flex-1 text-small text-ink-muted">
          Not watched yet
        </span>
        <Link
          href={`/trips/${hero.trip.id}/watch`}
          className="text-small font-medium text-agent"
        >
          Start watching
        </Link>
      </div>
    );
  }
  return decision ? (
    <Link
      href={decision.href}
      className="flex flex-1 items-start gap-2 bg-alert-tint px-3.5 py-2.5"
    >
      <Dot tone="alert" className="mt-1.5" />
      <div className="flex-1">
        <div className="text-small font-semibold">{decision.title}</div>
        <div className="text-mini text-ink-muted">{decision.detail}</div>
      </div>
    </Link>
  ) : (
    <div className="flex flex-1 items-center gap-2 bg-ok-tint px-3.5 py-2.5">
      <Dot tone="ok" />
      <span className="text-small font-medium">
        Nothing needs your attention
      </span>
    </div>
  );
}

export function TripHero({ hero }: { hero: Hero }) {
  const { trip, state } = hero;
  const today = trip.days[trip.currentDay - 1];
  const chip =
    state === "live"
      ? `${hero.example ? "Example · " : ""}Day ${trip.currentDay}/${trip.dayCount}`
      : state === "upcoming"
        ? hero.startsIn
        : "Finished";

  return (
    <Card
      accent={state === "live" ? "agent" : "none"}
      className="flex flex-col overflow-hidden lg:flex-row lg:items-stretch"
    >
      <div className="relative h-[140px] shrink-0 overflow-hidden lg:h-auto lg:min-h-[200px] lg:w-[296px]">
        <RoutedTripMap
          stops={hero.stops}
          routing={{ enabled: !hero.example }}
          interactive={false}
          fitPadding={24}
          className="absolute inset-0 size-full"
        />
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3.5 lg:gap-3.5 lg:px-[22px] lg:py-5">
        <div className="flex items-start gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <Headline className="text-[16px] lg:text-[21px]">
              {trip.title}
            </Headline>
            <Prose className="text-mini lg:text-small">
              {trip.dates} · {trip.party}
              <span className="hidden lg:inline"> · {trip.budget}</span>
            </Prose>
          </div>
          {chip ? (
            <Chip tone={state === "live" ? "agent" : "neutral"} size="sm">
              {chip}
            </Chip>
          ) : null}
        </div>

        <div className="flex flex-col overflow-hidden rounded-[9px] border border-hairline lg:flex-row">
          <StatusLine hero={hero} />
          {state !== "finished" && hero.watched
            ? hero.detectors.map((d) => (
                <div
                  key={d.name}
                  className="hidden items-center gap-2 border-l border-hairline px-3.5 py-2.5 lg:flex"
                >
                  <Dot tone={d.tone} />
                  <span className="text-small text-ink-muted">{d.name}</span>
                </div>
              ))
            : null}
        </div>

        <div className="flex items-center gap-2.5">
          {state === "live" ? (
            <ButtonLink
              href={dayHref(trip.id, today?.id ?? "today")}
              variant="primary"
              className="flex-1 lg:flex-none"
            >
              Open today
            </ButtonLink>
          ) : (
            <ButtonLink
              href={`/trips/${trip.id}/trip`}
              variant="primary"
              className="flex-1 lg:flex-none"
            >
              Open trip
            </ButtonLink>
          )}
          <ButtonLink href={`/trips/${trip.id}`}>Map</ButtonLink>
          {state === "live" ? (
            <ButtonLink href={`/trips/${trip.id}/trip`}>Trip</ButtonLink>
          ) : null}
          <div className="hidden flex-1 lg:block" />
          {state !== "finished" && hero.watched ? (
            <span className="hidden text-mini text-ink-faint lg:inline">
              {trip.lastCheck === "not yet"
                ? "Not checked yet"
                : `Last checked ${trip.lastCheck}`}{" "}
              · {trip.sourceCount} sources
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
