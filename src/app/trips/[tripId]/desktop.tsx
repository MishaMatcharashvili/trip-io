import Link from "next/link";
import {
  AdvisoryCard,
  AllClearCard,
  OpportunityCard,
} from "@/features/advisory";
import { CommandBar } from "@/features/command-bar";
import { CheckpointList } from "@/features/itinerary";
import { ConnectionSwitch, UndoButton } from "@/features/trip-actions";
import { WatchPassCard } from "@/features/watch-pass";
import { WatchStrip } from "@/features/watch-strip";
import { WeatherRibbon } from "@/ui/bars";
import { Button, ButtonLink } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { Icon } from "@/ui/icon";
import { Eyebrow, Headline, Num } from "@/ui/text";
import type { OverviewView } from "./view";

/** The day, floating over the map: weather ribbon first, then the nodes. */
function ItineraryPanel({ view }: { view: OverviewView }) {
  const { trip, day, weather, dayNav } = view;
  const done = day.checkpoints.filter((c) => c.state === "done").length;

  return (
    <Panel className="absolute left-6 top-5 z-20 flex max-h-[calc(100%-120px)] w-[352px] flex-col overflow-hidden">
      <div className="flex items-start gap-2.5 px-4 pb-[11px] pt-3.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <Eyebrow>
            {day.state === "today" ? "Today" : `Day ${day.index}`}
          </Eyebrow>
          <Headline>{day.title}</Headline>
        </div>
        <div className="flex items-center gap-1 pt-3">
          <Num className="mr-1 text-mini text-ink-faint">
            {done}/{day.checkpoints.length}
          </Num>
          {dayNav.previous ? (
            <Link
              href={dayNav.previous}
              aria-label="Previous day"
              className="text-ink-faint hover:text-ink"
            >
              <Icon name="chevronRight" size={15} className="rotate-180" />
            </Link>
          ) : null}
          {dayNav.next ? (
            <Link
              href={dayNav.next}
              aria-label="Next day"
              className="text-ink-faint hover:text-ink"
            >
              <Icon name="chevronRight" size={15} />
            </Link>
          ) : null}
        </div>
      </div>

      {weather ? (
        <div className="px-4 pb-3">
          <WeatherRibbon
            hours={weather.hours}
            caption={weather.caption}
            captionTone={weather.captionTone}
          />
        </div>
      ) : null}

      <Divider />
      <div className="min-h-0 overflow-y-auto">
        {day.checkpoints.length ? (
          <CheckpointList day={day} trip={trip} linkPlaces />
        ) : (
          <p className="px-4 py-3 text-small text-ink-faint">
            Nothing planned this day.
          </p>
        )}
      </div>
      <Divider />

      <div className="flex items-center gap-2 px-4 py-2.5">
        <Link
          href={`/trips/${trip.id}/trip`}
          className="text-small font-medium text-agent"
        >
          Open full trip
        </Link>
        <div className="flex-1" />
        <ButtonLink href={view.addStopHref} size="sm">
          Add stop
        </ButtonLink>
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

        <div className="absolute right-6 top-5 z-20 flex max-h-[calc(100%-120px)] w-[376px] flex-col gap-3 overflow-y-auto">
          <ConnectionSwitch
            sources={view.pausedSources}
            forceOffline={view.forcePaused}
          >
            <RightColumn view={view} />
          </ConnectionSwitch>
        </div>

        <WatchStrip
          detectors={[...view.strip]}
          className="absolute bottom-[30px] left-6 z-20"
        />

        <CommandBar
          tripId={view.askTripId ?? undefined}
          initialQuestion={view.initialQuestion}
          suggestions={view.suggestions}
          className="absolute bottom-[30px] left-1/2 z-20 w-[520px] -translate-x-1/2"
        />
      </div>
    </div>
  );
}
