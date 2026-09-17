import Link from "next/link";
import {
  advisory,
  calmStrip,
  type Day,
  opportunity,
  type Trip,
  todayWeather,
  watchStrip,
} from "@/data/trip";
import {
  AdvisoryCard,
  AllClearCard,
  OpportunityCard,
} from "@/features/advisory";
import { CommandBar } from "@/features/command-bar";
import { CheckpointList } from "@/features/itinerary";
import { WatchStrip } from "@/features/watch-strip";
import { WeatherRibbon } from "@/ui/bars";
import { Button } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Toggle } from "@/ui/control";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { Eyebrow, Headline, Num, Prose, Title } from "@/ui/text";
import type { ScreenState } from "./state";

/** Zoom, recentre, and the layer switcher — the map's own controls. */
function MapControls() {
  return (
    <>
      <div className="absolute bottom-[30px] right-6 z-20 w-[38px] overflow-hidden rounded-panel border border-hairline-strong bg-surface shadow-panel">
        <button
          type="button"
          aria-label="Zoom in"
          className="flex h-9 w-full items-center justify-center text-ink-muted hover:bg-canvas"
        >
          <Icon name="plus" />
        </button>
        <Divider />
        <button
          type="button"
          aria-label="Zoom out"
          className="flex h-9 w-full items-center justify-center text-ink-muted hover:bg-canvas"
        >
          <Icon name="minus" />
        </button>
        <Divider />
        <button
          type="button"
          aria-label="Recentre"
          className="flex h-9 w-full items-center justify-center text-ink-muted hover:bg-canvas"
        >
          <Icon name="locate" size={15} />
        </button>
      </div>

      <Panel className="absolute bottom-[30px] right-[74px] z-20 w-[212px] overflow-hidden">
        <div className="px-3.5 py-2.5">
          <Eyebrow>Layers</Eyebrow>
        </div>
        <Divider />
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <span className="flex-1 text-small">Weather</span>
          <Toggle label="Weather layer" size="sm" defaultOn />
        </div>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          <span className="flex-1 text-small">Road incidents</span>
          <Toggle label="Road incidents layer" size="sm" defaultOn />
        </div>
        <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-2.5">
          <span className="flex-1 text-small text-ink-muted">
            Terrain relief
          </span>
          <Toggle label="Terrain relief layer" size="sm" />
        </div>
      </Panel>
    </>
  );
}

/** A checkpoint opened from the map, without leaving the map. */
function CheckpointPopover({ tripId }: { tripId: string }) {
  return (
    <Panel className="absolute left-[38%] top-[36%] z-20 w-[246px] overflow-hidden">
      <div className="px-3.5 pt-3">
        <Eyebrow tone="agent">Checkpoint 5 of 6</Eyebrow>
      </div>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3 pt-1.5">
        <Title className="text-[15px]">Gergeti Trinity Church</Title>
        <div className="flex gap-3.5">
          {[
            { label: "Ascent", value: "400 m" },
            { label: "Return", value: "2h 40m" },
            { label: "Grade", value: "Moderate" },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-px">
              <Eyebrow>{stat.label}</Eyebrow>
              <Num className="text-small font-semibold">{stat.value}</Num>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2 rounded-control bg-alert-tint px-2.5 py-2">
          <Dot tone="alert" className="mt-1" />
          <span className="flex-1 text-mini text-alert">
            Scheduled inside the rain window
          </span>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="flex-1">
            Move to 11:30
          </Button>
          <Link
            href={`/trips/${tripId}/place/3e`}
            aria-label="Open checkpoint"
            className="flex size-8 items-center justify-center rounded-control border border-control bg-surface text-ink-muted hover:bg-canvas"
          >
            <Icon name="chevronRight" size={14} />
          </Link>
        </div>
      </div>
    </Panel>
  );
}

/** The day, floating over the map: weather ribbon first, then the nodes. */
function ItineraryPanel({
  trip,
  day,
  calm,
}: {
  trip: Trip;
  day: Day;
  calm: boolean;
}) {
  const done = day.checkpoints.filter((c) => c.state === "done").length;

  return (
    <Panel className="absolute left-6 top-5 z-20 w-[352px] overflow-hidden">
      <div className="flex items-start gap-2.5 px-4 pb-[11px] pt-3.5">
        <div className="flex flex-1 flex-col gap-0.5">
          <Eyebrow>Today</Eyebrow>
          <Headline>{day.title}</Headline>
        </div>
        <div className="flex items-center gap-1.5 pt-3">
          <Num className="text-mini text-ink-faint">
            {done}/{day.checkpoints.length}
          </Num>
          <Icon name="chevronDown" size={15} className="text-ink-faint" />
        </div>
      </div>

      {calm ? null : (
        <div className="px-4 pb-3">
          <WeatherRibbon hours={todayWeather} caption="Rain 15:30–19:00" />
        </div>
      )}

      <Divider />
      <CheckpointList day={day} trip={trip} linkPlaces />
      <Divider />

      <div className="flex items-center gap-2 px-4 py-2.5">
        <Link
          href={`/trips/${trip.id}/trip`}
          className="text-small font-medium text-agent"
        >
          Open full trip
        </Link>
        <div className="flex-1" />
        <Button size="sm">Add stop</Button>
      </div>
    </Panel>
  );
}

/** The confirmation that follows an applied replan, with its 24-hour undo. */
function AppliedPanel({ className }: { className?: string }) {
  return (
    <Panel accent="ok" className={`overflow-hidden ${className ?? ""}`}>
      <div className="flex items-center gap-2.5 border-b border-ok-line bg-ok-tint px-3.5 py-3">
        <span className="flex size-5 items-center justify-center rounded-full bg-ok text-on-accent">
          <Icon name="check" size={11} strokeWidth={2.6} />
        </span>
        <Eyebrow tone="ok">Day updated · 2 changes applied</Eyebrow>
      </div>
      <div className="flex flex-col gap-3 p-3.5">
        <Headline>Your afternoon is out of the rain</Headline>
        <div className="flex flex-col gap-2">
          {[
            ["16:00 hike", "11:30 hike"],
            ["12:30 lunch", "14:45 lunch"],
          ].map(([from, to]) => (
            <div key={from} className="flex items-center gap-2.5">
              <Num className="w-[78px] text-mini text-ink-faint line-through">
                {from}
              </Num>
              <Icon name="arrowRight" size={13} className="text-agent" />
              <Num className="flex-1 text-mini font-semibold text-agent">
                {to}
              </Num>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-2.5 rounded-control bg-canvas px-3 py-2.5">
          <Icon name="info" size={14} className="mt-px text-ink-faint" />
          <span className="flex-1 text-mini text-ink-muted">
            Zeta Camp has been notified of the new time. Nothing else moved.
          </span>
        </div>
      </div>
      <Divider />
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <div className="flex-1">
          <div className="text-small font-medium">Changed your mind?</div>
          <div className="text-mini text-ink-faint">
            Revert until 15:52 tomorrow
          </div>
        </div>
        <Button size="sm">
          <Icon name="revert" size={14} />
          Undo
        </Button>
      </div>
    </Panel>
  );
}

/** The honest state: it says it stopped watching, and timestamps every source. */
function PausedPanel({ trip, className }: { trip: Trip; className?: string }) {
  return (
    <Panel className={`overflow-hidden ${className ?? ""}`}>
      <div className="flex flex-col gap-3 px-4 pb-3.5 pt-[18px]">
        <div className="flex items-center gap-2.5">
          <Icon name="offline" size={17} className="text-ink-faint" />
          <Eyebrow>Watch layer paused</Eyebrow>
        </div>
        <Headline className="text-[20px]">I stopped watching at 13:04</Headline>
        <Prose>
          No connection since you left Gudauri. Your itinerary is all here, but
          I cannot see weather, roads or transport until you are back online —
          so treat everything below as last known, not current.
        </Prose>
        <div className="flex gap-2.5">
          <Button variant="primary" size="lg" className="flex-1">
            Try again
          </Button>
          <Button size="lg">Dismiss</Button>
        </div>
      </div>
      <Divider />
      <div className="flex flex-col px-4 pb-3.5 pt-3">
        {[
          ["Weather", "Last seen 13:04"],
          ["Roads", "Last seen 13:01"],
          ["Transport", "Last seen 12:48"],
          ["Local events", "Last seen 12:20"],
        ].map(([name, seen], i) => (
          <div
            key={name}
            className={`flex items-center gap-2.5 py-2 ${i > 0 ? "border-t border-track" : ""}`}
          >
            <Dot tone="idle" />
            <span className="flex-1 text-small text-ink-muted">{name}</span>
            <span className="text-mini text-ink-faint">{seen}</span>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <Chip size="sm">Trip {trip.id} · last known plan</Chip>
      </div>
    </Panel>
  );
}

export function ActiveTripDesktop({
  trip,
  day,
  state,
}: {
  trip: Trip;
  day: Day;
  state: ScreenState;
}) {
  const calm = state === "calm";

  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block">
      <div className="pointer-events-auto">
        <ItineraryPanel trip={trip} day={day} calm={calm} />

        <div className="absolute right-6 top-5 z-20 flex w-[376px] flex-col gap-3">
          {state === "advisory" ? (
            <>
              <AdvisoryCard advisory={advisory} tripId={trip.id} />
              <OpportunityCard opportunity={opportunity} />
            </>
          ) : null}
          {calm ? (
            <AllClearCard
              sources={trip.sources.map((s) => ({
                name: s.name,
                tone: s.tone === "ok" ? "ok" : "idle",
                status: s.status,
              }))}
              nextSweep="Next full sweep at 15:00"
              watchHref={`/trips/${trip.id}/watch`}
            />
          ) : null}
          {state === "applied" ? <AppliedPanel /> : null}
          {state === "paused" ? <PausedPanel trip={trip} /> : null}
        </div>

        {state === "advisory" ? <CheckpointPopover tripId={trip.id} /> : null}

        <WatchStrip
          detectors={calm ? calmStrip : watchStrip}
          className="absolute bottom-[30px] left-6 z-20"
        />

        <MapControls />

        <CommandBar
          suggestions={
            state === "advisory"
              ? ["Is the hike ok for my father?", "Indoor options near Kazbegi"]
              : []
          }
          className="absolute bottom-[30px] left-1/2 z-20 w-[520px] -translate-x-1/2"
        />
      </div>
    </div>
  );
}
