import Link from "next/link";
import {
  AdvisoryCard,
  AllClearCard,
  OpportunityCard,
} from "@/features/advisory";
import { CommandBar } from "@/features/command-bar";
import { DayStrip } from "@/features/day-strip";
import { hrefFor } from "@/features/day-strip-model";
import { CheckpointList } from "@/features/itinerary";
import { ConnectionSwitch, UndoButton } from "@/features/trip-actions";
import { dayHref } from "@/features/trip-links";
import { WatchPassCard } from "@/features/watch-pass";
import { WatchStrip } from "@/features/watch-strip";
import { WeatherRibbon } from "@/ui/bars";
import { Button, ButtonLink } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { Eyebrow, Headline, Num } from "@/ui/text";
import type { OverviewView } from "./view";

// Where each panel floats over the map. The loading state (map-skeleton.tsx)
// uses the same strings, so a panel arriving does not move.
export const ITINERARY_FRAME =
  "absolute left-6 top-5 z-20 flex max-h-[calc(100%-120px)] w-[352px] flex-col overflow-hidden";
// Its cards keep their height (`shrink-0`): shrunk to fit, a card clips its own
// content and the column never has anything to scroll.
export const RIGHT_COLUMN_FRAME =
  "absolute right-6 top-5 z-20 flex max-h-[calc(100%-120px)] w-[376px] flex-col gap-3 overflow-y-auto [&>*]:shrink-0";
export const WATCH_STRIP_FRAME = "absolute bottom-[30px] left-6 z-20";
export const COMMAND_BAR_FRAME =
  "absolute bottom-[30px] left-1/2 z-20 w-[520px] -translate-x-1/2";

/** The days of the trip as one list: what "all" shows in place of a single day. */
function AllDays({ view }: { view: OverviewView }) {
  const { trip } = view;
  return (
    <div className="min-h-0 overflow-y-auto">
      {trip.days.map((d, i) => (
        <div key={d.id}>
          {i > 0 ? <Divider /> : null}
          <Link
            href={hrefFor(trip.id, d.id)}
            replace
            scroll={false}
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-canvas"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Num
                className={
                  d.state === "today"
                    ? "text-mini font-semibold text-agent"
                    : "text-mini text-ink-faint"
                }
              >
                {d.stamp}
              </Num>
              <span className="truncate text-small font-medium">
                {d.summary}
              </span>
              <span className="truncate text-mini text-ink-faint">
                {d.route}
              </span>
            </div>
            <Dot tone={d.watch.tone} />
            <Icon name="chevronRight" size={14} className="text-ink-faint" />
          </Link>
        </div>
      ))}
    </div>
  );
}

/** The day, floating over the map: its days to choose from, weather first, then the nodes. */
function ItineraryPanel({ view }: { view: OverviewView }) {
  const { trip, day, weather } = view;
  const all = view.mode === "all";
  const done = day.checkpoints.filter((c) => c.state === "done").length;
  const stopCount = trip.days.reduce((n, d) => n + d.checkpoints.length, 0);

  return (
    <Panel className={ITINERARY_FRAME}>
      <div className="flex items-start gap-2.5 px-4 pb-2.5 pt-3.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <Eyebrow>
            {all
              ? "Whole trip"
              : day.state === "today"
                ? `Today · day ${day.index} of ${trip.dayCount}`
                : `Day ${day.index} of ${trip.dayCount} · ${day.route}`}
          </Eyebrow>
          <Headline>
            {all ? `${trip.dayCount} days, ${stopCount} stops` : day.title}
          </Headline>
        </div>
        {all ? null : (
          <Num className="pt-3 text-mini text-ink-faint">
            {done}/{day.checkpoints.length}
          </Num>
        )}
      </div>

      <DayStrip
        tripId={trip.id}
        chips={view.days}
        selected={view.selected}
        className="px-4 pb-3"
      />

      {!all && weather ? (
        <div className="px-4 pb-3">
          <WeatherRibbon
            hours={weather.hours}
            caption={weather.caption}
            captionTone={weather.captionTone}
          />
        </div>
      ) : null}

      <Divider />
      {all ? (
        <AllDays view={view} />
      ) : (
        <div className="min-h-0 overflow-y-auto">
          {day.checkpoints.length ? (
            <CheckpointList day={day} trip={trip} linkPlaces />
          ) : (
            <p className="px-4 py-3 text-small text-ink-faint">
              Nothing planned this day.
            </p>
          )}
        </div>
      )}
      <Divider />

      <div className="flex items-center gap-2 px-4 py-2.5">
        <Link
          href={all ? `/trips/${trip.id}/trip` : dayHref(trip.id, day.id)}
          className="text-small font-medium text-agent"
        >
          {all ? "Open the plan" : "Open this day"}
        </Link>
        <div className="flex-1" />
        {all ? null : (
          <ButtonLink href={view.addStopHref} size="sm">
            Add stop
          </ButtonLink>
        )}
      </div>
    </Panel>
  );
}

/** The confirmation that follows an applied change, with its undo. */
function AppliedPanel({
  applied,
}: {
  applied: NonNullable<OverviewView["applied"]>;
}) {
  return (
    <Panel accent="ok" className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-ok-line bg-ok-tint px-3.5 py-3">
        <span className="flex size-5 items-center justify-center rounded-full bg-ok text-on-accent">
          <Icon name="check" size={11} strokeWidth={2.6} />
        </span>
        <Eyebrow tone="ok">{applied.eyebrow}</Eyebrow>
      </div>
      <div className="flex flex-col gap-3 p-3.5">
        <Headline>{applied.headline}</Headline>
        <div className="flex flex-col gap-2">
          {applied.rows.map(({ from, to }) => (
            <div key={`${from}-${to}`} className="flex items-center gap-2.5">
              <Num className="w-[120px] truncate text-mini text-ink-faint line-through">
                {from}
              </Num>
              <Icon name="arrowRight" size={13} className="text-agent" />
              <Num className="flex-1 truncate text-mini font-semibold text-agent">
                {to}
              </Num>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2.5 rounded-control bg-canvas px-3 py-2.5">
          <Icon name="info" size={14} className="mt-px text-ink-faint" />
          <span className="flex-1 text-mini text-ink-muted">
            {applied.note}
          </span>
        </div>
      </div>
      <Divider />
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <div className="flex-1">
          <div className="text-small font-medium">Changed your mind?</div>
          <div className="text-mini text-ink-faint">{applied.until}</div>
        </div>
        {applied.undoTripId ? (
          <UndoButton tripId={applied.undoTripId} />
        ) : (
          <Button size="sm">
            <Icon name="revert" size={14} />
            Undo
          </Button>
        )}
      </div>
    </Panel>
  );
}

function RightColumn({ view }: { view: OverviewView }) {
  const { trip, state } = view;
  return (
    <>
      {view.offer ? (
        <WatchPassCard tripId={trip.id} offer={view.offer} />
      ) : null}
      {state === "advisory" && view.advisory ? (
        <AdvisoryCard
          advisory={view.advisory}
          tripId={trip.id}
          href={view.advisory.href}
          interventionId={view.advisory.interventionId}
        />
      ) : null}
      {view.opportunity ? (
        <OpportunityCard opportunity={view.opportunity} />
      ) : null}
      {state === "calm" ? (
        <AllClearCard
          sources={trip.sources.map((s) => ({
            name: s.name,
            tone: s.tone === "ok" ? "ok" : "idle",
            status: s.status,
          }))}
          headline={view.calmHeadline}
          note={view.calmNote}
          nextSweep={view.nextSweep}
          watchHref={`/trips/${trip.id}/watch`}
        />
      ) : null}
      {state === "applied" && view.applied ? (
        <AppliedPanel applied={view.applied} />
      ) : null}
    </>
  );
}

export function ActiveTripDesktop({ view }: { view: OverviewView }) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block">
      <div className="pointer-events-auto">
        <ItineraryPanel view={view} />

        <div className={RIGHT_COLUMN_FRAME}>
          <ConnectionSwitch
            sources={view.pausedSources}
            forceOffline={view.forcePaused}
          >
            <RightColumn view={view} />
          </ConnectionSwitch>
        </div>

        <WatchStrip detectors={[...view.strip]} className={WATCH_STRIP_FRAME} />

        <CommandBar
          tripId={view.askTripId ?? undefined}
          initialQuestion={view.initialQuestion}
          suggestions={view.suggestions}
          className={COMMAND_BAR_FRAME}
        />
      </div>
    </div>
  );
}
