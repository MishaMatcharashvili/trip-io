import Link from "next/link";
import { advisory, type Day, type Trip } from "@/data/trip";
import { MobileHeader } from "@/features/chrome";
import { CommandBar } from "@/features/command-bar";
import { Button, ButtonLink } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { Sheet } from "@/ui/sheet";
import { Eyebrow, Headline, Num, Prose, Title } from "@/ui/text";
import type { ScreenState } from "./state";

/** The interrupt as it arrives on a phone: the claim, then one clear action. */
function MobileAdvisory({ tripId }: { tripId: string }) {
  return (
    <Panel
      accent="alert"
      className="absolute inset-x-3 top-[112px] z-20 overflow-hidden"
    >
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <Icon name="rain" size={15} className="text-alert" />
        <Eyebrow tone="alert">Affects your 16:00</Eyebrow>
        <div className="flex-1" />
        <button type="button" aria-label="Dismiss" className="text-ink-faint">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-1.5">
        <Title className="text-[16.5px]">{advisory.headline}</Title>
        <Prose>
          Your Gergeti hike sits in the 12 mm window. Moving it to{" "}
          <Num className="font-medium text-ink">11:30</Num> keeps it dry and
          shifts the museum to the afternoon.
        </Prose>
        <div className="flex gap-2">
          <ButtonLink
            href={`/trips/${tripId}/replan`}
            variant="primary"
            size="lg"
            className="flex-1"
          >
            Replan my day
          </ButtonLink>
          <ButtonLink href={`/trips/${tripId}/alerts/${advisory.id}`} size="lg">
            Why?
          </ButtonLink>
        </div>
      </div>
    </Panel>
  );
}

function MobileApplied() {
  return (
    <Panel
      accent="ok"
      className="absolute inset-x-3 top-[112px] z-20 overflow-hidden"
    >
      <div className="flex items-center gap-2 border-b border-ok-line bg-ok-tint px-3.5 py-3">
        <span className="flex size-5 items-center justify-center rounded-full bg-ok text-on-accent">
          <Icon name="check" size={11} strokeWidth={2.6} />
        </span>
        <Eyebrow tone="ok">Day updated · 2 changes applied</Eyebrow>
      </div>
      <div className="flex flex-col gap-3 px-3.5 py-3.5">
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
        <Button size="sm">Undo</Button>
      </div>
    </Panel>
  );
}

function MobilePaused() {
  return (
    <Panel className="absolute inset-x-3 top-[112px] z-20 overflow-hidden">
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
    </Panel>
  );
}

function MobileCalm({ trip }: { trip: Trip }) {
  return (
    <Panel
      accent="ok"
      className="absolute inset-x-3 top-[112px] z-20 overflow-hidden"
    >
      <div className="flex flex-col gap-2.5 px-4 pb-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-[26px] items-center justify-center rounded-full bg-ok-tint text-ok">
            <Icon name="check" size={14} strokeWidth={2.2} />
          </span>
          <Eyebrow tone="ok">Nothing needs your attention</Eyebrow>
        </div>
        <Headline>Today is going to plan</Headline>
        <Prose>
          Checked everything on your route since 06:00 — nothing changes your
          day. I will interrupt you if that stops being true.
        </Prose>
        <Link
          href={`/trips/${trip.id}/watch`}
          className="text-small font-medium text-agent"
        >
          What I watch
        </Link>
      </div>
    </Panel>
  );
}

export function ActiveTripMobile({
  trip,
  day,
  state,
}: {
  trip: Trip;
  day: Day;
  state: ScreenState;
}) {
  const now = day.checkpoints.find((c) => c.state === "now");
  const next = day.checkpoints.find((c) => c.state === "upcoming");
  const done = day.checkpoints.filter((c) => c.state === "done").length;
  const left = day.checkpoints.length - done - (now ? 1 : 0);

  return (
    <div className="lg:hidden">
      <MobileHeader
        trip={trip}
        day={day.route}
        watch={state === "paused" ? "paused" : "watching"}
      />

      {state === "advisory" ? <MobileAdvisory tripId={trip.id} /> : null}
      {state === "applied" ? <MobileApplied /> : null}
      {state === "paused" ? <MobilePaused /> : null}
      {state === "calm" ? <MobileCalm trip={trip} /> : null}

      <Sheet className="absolute inset-x-0 bottom-20 z-20">
        <div className="flex items-start gap-2.5 px-4 pb-2.5 pt-1">
          <div className="flex flex-1 flex-col gap-0.5">
            <Eyebrow tone={state === "paused" ? "neutral" : "agent"}>
              {state === "paused" ? "Your plan, as of 13:04" : "Now"}
            </Eyebrow>
            <Title className="text-[16px]">{now?.title ?? day.summary}</Title>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <Num className="text-small font-semibold">15:10</Num>
            <Eyebrow>{state === "paused" ? "Estimated" : "38 km left"}</Eyebrow>
          </div>
        </div>

        <Divider className="mx-4" />

        {next ? (
          <Link
            href={`/trips/${trip.id}/place/${next.id}`}
            className="flex items-center gap-[11px] px-4 py-3"
          >
            <Num className="w-10 text-mini text-ink-faint">{next.time}</Num>
            <div className="flex-1">
              <div className="text-small font-medium">{next.title}</div>
              <div
                className={
                  next.conflict
                    ? "text-mini text-alert"
                    : "text-mini text-ink-faint"
                }
              >
                {next.conflict ?? next.detail}
              </div>
            </div>
            <Icon name="chevronRight" size={16} className="text-ink-faint" />
          </Link>
        ) : null}

        <div className="flex items-center gap-2 px-4 pb-2.5">
          <Chip size="sm">{done} done</Chip>
          <Chip size="sm">{left} left today</Chip>
          <div className="flex-1" />
          <Link
            href={`/trips/${trip.id}/day/${day.id}`}
            className="text-mini font-medium text-agent"
          >
            Expand itinerary
          </Link>
        </div>

        <CommandBar
          compact
          placeholder="Ask about your trip"
          className="mx-4 mb-3.5"
        />
      </Sheet>
    </div>
  );
}
