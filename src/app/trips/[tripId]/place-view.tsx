import Link from "next/link";
import { notFound } from "next/navigation";
import { savedPlaceIds } from "@/bll/saved";
import type { TripScreen } from "@/bll/trip-screen";
import { type Checkpoint, type Day, getTrip, type Trip } from "@/data/trip";
import { summariseHours } from "@/domain/catalogue/opening-hours";
import { PlaceVoices } from "@/features/place-voices";
import { RoutedTripMap } from "@/features/routed-trip-map";
import { SaveToggle } from "@/features/save-toggle";
import { StopSuggestions } from "@/features/stop-suggestions";
import { RemoveStopButton } from "@/features/trip-actions";
import { dayHref } from "@/features/trip-links";
import { duration, mapStops, timeRange } from "@/features/trip-model";
import { Button, ButtonLink } from "@/ui/button";
import type { Tone } from "@/ui/cx";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BasemapMobile } from "@/ui/map/basemap-mobile";
import type { MapStop } from "@/ui/map/trip-map";
import { Display, Eyebrow, Num, Prose } from "@/ui/text";
import { loadTrip } from "./load";

// A stop of a trip, as a screen: what it is, when, what the watch keeps an eye
// on there, what others say, what can be done. It is read in two places — as a
// page of its own at /trips/:id/place/:stop, and as a popup over whatever the
// traveller was looking at (the map, the plan), through an intercepting route.
// Both draw the same body from the same view, so a place cannot be one thing in
// a popup and another when its link is shared.

type WatchRow = { name: string; tone: Tone; status: string };

export type PlaceView =
  | { kind: "fixture"; trip: Trip; day: Day; checkpoint: Checkpoint }
  | {
      kind: "real";
      trip: Trip;
      day: Day;
      stop: Checkpoint;
      node: NonNullable<Checkpoint["node"]>;
      place: TripScreen["places"][string] | undefined;
      saved: boolean;
      /** This stop's place in its day, from 1. */
      position: number;
      watched: WatchRow[];
      /** The change waiting on the traveller, if there is one. */
      openAlertId: string | null;
      head: string | null;
      /** The day's stops, for the map behind the page. */
      stops: MapStop[];
    };

const tierWords = {
  curated: "Hand-checked",
  verified: "Verified",
  raw: "Unverified",
} as const;

const kindWords = {
  visit: "Visit",
  meal: "Meal",
  transfer: "Drive",
  stay: "Stay",
} as const;

/** The canvas's reference render of a checkpoint: its figures, and what is watched. */
const fixtureStats = [
  { label: "Scheduled", value: "16:00" },
  { label: "Return", value: "2h 40m" },
  { label: "Ascent", value: "400 m" },
  { label: "Grade", value: "Moderate" },
];

const fixtureWatched: WatchRow[] = [
  { name: "Weather on the ridge", tone: "alert", status: "1 change today" },
  { name: "Trail condition reports", tone: "ok", status: "Clear · 3 h ago" },
  { name: "Church opening hours", tone: "ok", status: "Verified · 2 h ago" },
];

/** The stop, or the page's 404. `placeId` is the stop's node id: a place can be visited twice. */
export async function loadPlaceView(
  tripId: string,
  placeId: string,
): Promise<PlaceView> {
  const fixture = getTrip(tripId);
  if (fixture) {
    const day = fixture.days.find((d) =>
      d.checkpoints.some((c) => c.id === placeId),
    );
    const checkpoint = day?.checkpoints.find((c) => c.id === placeId);
    if (!day || !checkpoint) notFound();
    return { kind: "fixture", trip: fixture, day, checkpoint };
  }

  const { screen, trip, userId } = await loadTrip(tripId);
  const day = trip.days.find((d) =>
    d.checkpoints.some((c) => c.id === placeId),
  );
  const stop = day?.checkpoints.find((c) => c.id === placeId);
  if (!day || !stop?.node) notFound();

  const node = stop.node;
  const place = node.placeId ? screen.places[node.placeId] : undefined;
  const saved = node.placeId
    ? (await savedPlaceIds(userId)).includes(node.placeId)
    : false;
  const matches = screen.matches.filter((m) => m.nodeId === stop.id);
  const open = screen.alerts.alerts.find((a) => a.outcome === null);
  const matched = (prefix: string) =>
    matches.some((m) => m.kind.startsWith(prefix));

  const watched: WatchRow[] = [
    {
      name: "Weather here",
      tone: matched("weather") ? "alert" : screen.watch ? "ok" : "idle",
      status: matched("weather")
        ? "Changes your plan"
        : screen.watch
          ? "Nothing forecast"
          : "Not watched",
    },
    ...(node.kind === "transfer"
      ? [
          {
            name: "The road",
            tone: matched("road") ? ("alert" as const) : ("ok" as const),
            status: matched("road") ? "Reported" : "No reports",
          },
        ]
      : []),
    {
      name: "Opening hours",
      tone: place?.openingHours ? "ok" : "idle",
      status: place?.openingHours
        ? summariseHours(place.openingHours)
        : "Unknown",
    },
  ];

  return {
    kind: "real",
    trip,
    day,
    stop: stop as Checkpoint,
    node,
    place,
    saved,
    position: day.checkpoints.indexOf(stop) + 1,
    watched,
    openAlertId: open?.id ?? null,
    head: screen.head,
    stops: mapStops(day),
  };
}

/** The title of a stop, as the heading of the body and for the toolbar to sit beside. */
export function placeTitle(view: PlaceView): string {
  return view.kind === "fixture"
    ? "Gergeti Trinity Church"
    : (view.place?.name ?? view.stop.title);
}

/** Back to the day this stop is in. */
export const placeBack = (view: PlaceView) =>
  dayHref(view.trip.id, view.day.id);

/** The save control for a stop that has a place to save; null for one that has not. */
export function PlaceSave({
  view,
  className,
}: {
  view: PlaceView;
  className?: string;
}) {
  if (view.kind === "fixture") {
    return (
      <button
        type="button"
        aria-label="Save this place"
        className={cx(
          "flex items-center justify-center text-ink-muted",
          className,
        )}
      >
        <Icon name="bookmark" size={17} />
      </button>
    );
  }
  return view.node.placeId ? (
    <SaveToggle
      name={placeTitle(view)}
      placeId={view.node.placeId}
      defaultSaved={view.saved}
      className={className}
    />
  ) : null;
}

function WatchedRows({ rows }: { rows: WatchRow[] }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-hairline px-[18px] py-3.5">
      <Eyebrow>What I keep an eye on here</Eyebrow>
      <div className="flex flex-col">
        {rows.map((item, i) => (
          <div
            key={item.name}
            className={cx(
              "flex items-center gap-3 py-[7px]",
              i > 0 && "border-t border-track",
            )}
          >
            <Dot tone={item.tone} />
            <span className="flex-1 text-small text-ink-muted">
              {item.name}
            </span>
            <span className="text-mini text-ink-faint">{item.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stats({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="flex gap-0 border-b border-hairline px-[18px] pb-3.5">
      {items.map((stat) => (
        <div key={stat.label} className="flex flex-1 flex-col gap-0.5">
          <Eyebrow>{stat.label}</Eyebrow>
          <Num className="text-small font-semibold">{stat.value}</Num>
        </div>
      ))}
    </div>
  );
}

/** The heading, with room beside it for the popup's own controls. */
function Heading({
  eyebrow,
  title,
  lead,
  toolbar,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  toolbar?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-[18px] pb-3.5 pt-[18px]">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Eyebrow tone="agent">{eyebrow}</Eyebrow>
        <Display className="text-[26px]">{title}</Display>
        <Prose>{lead}</Prose>
      </div>
      {toolbar}
    </div>
  );
}

/**
 * What is inside the sheet. `toolbar` is the save control when the popup draws
 * it beside the title; the page draws it over its map instead.
 */
export function PlaceBody({
  view,
  toolbar,
}: {
  view: PlaceView;
  toolbar?: React.ReactNode;
}) {
  if (view.kind === "fixture") {
    const { trip, day, checkpoint } = view;
    const position = day.checkpoints.indexOf(checkpoint) + 1;
    return (
      <>
        <Heading
          eyebrow={`Checkpoint ${position} of ${day.checkpoints.length} · ${day.title.split(" ")[0]}`}
          title="Gergeti Trinity Church"
          lead="A 14th-century church on a spur above Stepantsminda, at 2,170 m."
          toolbar={toolbar}
        />
        <Stats items={fixtureStats} />

        {checkpoint.conflict ? (
          <div className="flex flex-col gap-3 border-b border-hairline px-[18px] py-3.5">
            <div className="flex items-start gap-3 rounded-[9px] border border-alert-line bg-alert-tint px-3.5 py-3">
              <Dot tone="alert" className="mt-1.5" />
              <div className="flex-1">
                <div className="text-small font-semibold">
                  Scheduled inside the rain window
                </div>
                <div className="text-mini text-ink-muted">
                  12 mm from 15:30. The ridge is exposed the whole way up and
                  the track gets slick above the treeline.
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <Button variant="primary" size="lg" className="flex-1">
                Move to 11:30
              </Button>
              <Button size="lg">Other times</Button>
            </div>
          </div>
        ) : null}

        <WatchedRows rows={fixtureWatched} />

        <div className="flex flex-col gap-2.5 px-[18px] py-3.5">
          <Eyebrow>Why it is in your trip</Eyebrow>
          <Prose>
            The one place in your week that is both nature and a monastery.
            Placed on day {day.index} because it is the only moderate climb and
            you are rested by then.
          </Prose>
        </div>

        <div className="flex-1" />

        <div className="flex gap-2.5 border-t border-hairline px-[18px] pb-[22px] pt-3">
          <Button size="lg" className="flex-1">
            Directions
          </Button>
          <Button size="lg" className="flex-1">
            Ask about it
          </Button>
          <Button variant="ghost" size="lg" className="px-3">
            Remove
          </Button>
        </div>
        <span className="sr-only">{trip.title}</span>
      </>
    );
  }

  const { trip, day, stop, node, place, position, watched, openAlertId } = view;
  const at = node.lonLat;
  const name = place?.name ?? stop.title;

  return (
    <>
      <Heading
        eyebrow={`Stop ${position} of ${day.checkpoints.length} · ${day.title.split(" ")[0]}`}
        title={name}
        lead={
          [place?.category.replace(/_/g, " "), place?.nameKa, place?.address]
            .filter(Boolean)
            .join(" · ") || stop.title
        }
        toolbar={toolbar}
      />

      <Stats
        items={[
          { label: "Scheduled", value: timeRange(node) },
          { label: "Takes", value: duration(node.durationMin) },
          { label: "Kind", value: kindWords[node.kind] },
          {
            label: "Checked",
            value: place ? tierWords[place.tier] : "Your own",
          },
        ]}
      />

      {stop.conflict ? (
        <div className="flex flex-col gap-3 border-b border-hairline px-[18px] py-3.5">
          <div className="flex items-start gap-3 rounded-[9px] border border-alert-line bg-alert-tint px-3.5 py-3">
            <Dot tone="alert" className="mt-1.5" />
            <div className="flex-1">
              <div className="text-small font-semibold">{stop.conflict}</div>
              <div className="text-mini text-ink-muted">
                The watch matched this to your stop and judged it worth telling
                you.
              </div>
            </div>
          </div>
          <div className="flex gap-2.5">
            {openAlertId ? (
              <ButtonLink
                href={`/trips/${trip.id}/alerts/${openAlertId}`}
                variant="primary"
                size="lg"
                className="flex-1"
              >
                See what I suggest
              </ButtonLink>
            ) : null}
            <ButtonLink
              href={dayHref(trip.id, day.id)}
              size="lg"
              className={openAlertId ? undefined : "flex-1"}
            >
              Change the time
            </ButtonLink>
          </div>
        </div>
      ) : null}

      <WatchedRows rows={watched} />

      {node.placeId ? <PlaceVoices placeId={node.placeId} name={name} /> : null}

      {place?.website || place?.phone ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-hairline px-[18px] py-3">
          {place.website ? (
            <a
              href={place.website}
              target="_blank"
              rel="noreferrer"
              className="text-small font-medium text-agent"
            >
              Website
            </a>
          ) : null}
          {place.phone ? (
            <a
              href={`tel:${place.phone}`}
              className="text-small font-medium text-agent"
            >
              {place.phone}
            </a>
          ) : null}
        </div>
      ) : null}

      {node.kind === "visit" || node.kind === "meal" ? (
        <StopSuggestions
          tripId={trip.id}
          nodeId={stop.id}
          head={view.head}
          editHref={dayHref(trip.id, day.id)}
        />
      ) : null}

      <div className="flex flex-col gap-2.5 px-[18px] py-3.5">
        <Eyebrow>Why it is in your trip</Eyebrow>
        <Prose>
          {node.kind === "stay"
            ? "Your base for the night."
            : `Part of day ${day.index}: ${day.summary}.`}
        </Prose>
      </div>

      <div className="flex-1" />

      <div className="flex gap-2.5 border-t border-hairline px-[18px] pb-[22px] pt-3">
        {at ? (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${at[1]},${at[0]}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-[10px] border border-control bg-surface text-title font-medium hover:bg-canvas"
          >
            Directions
          </a>
        ) : null}
        <ButtonLink
          href={`/trips/${trip.id}?ask=${encodeURIComponent(`Tell me about ${name}`)}`}
          size="lg"
          className="flex-1"
        >
          Ask about it
        </ButtonLink>
        <RemoveStopButton
          tripId={trip.id}
          head={view.head}
          nodeId={stop.id}
          title={stop.title}
          back={dayHref(trip.id, day.id)}
        />
      </div>
    </>
  );
}

/** The page's own map and its back and save controls, floating over it. */
export function PlaceMapHeader({ view }: { view: PlaceView }) {
  const control =
    "flex size-[38px] items-center justify-center rounded-[10px] border border-hairline-strong bg-surface text-ink-muted shadow-panel";
  return (
    <>
      <div
        className={cx(
          "absolute inset-x-0 top-0 overflow-hidden",
          view.kind === "fixture" ? "h-[230px]" : "h-[260px]",
        )}
      >
        {view.kind === "fixture" ? (
          <BasemapMobile className="absolute inset-0 size-full" />
        ) : (
          <RoutedTripMap
            stops={view.stops}
            selectedId={view.stop.id}
            fitPadding={{ top: 90, right: 40, bottom: 60, left: 40 }}
            className="absolute inset-0 size-full"
          />
        )}
      </div>

      <div className="absolute inset-x-4 top-13 z-20 flex items-center gap-2.5">
        <Link
          href={placeBack(view)}
          aria-label="Back to the day"
          className={control}
        >
          <Icon name="chevronLeft" size={18} />
        </Link>
        <div className="flex-1" />
        <PlaceSave view={view} className={control} />
      </div>
    </>
  );
}
