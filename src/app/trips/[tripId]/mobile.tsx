import Link from "next/link";
import { MobileHeader } from "@/features/chrome";
import { CommandBar } from "@/features/command-bar";
import {
  ConnectionSwitch,
  KeepPlanAction,
  UndoButton,
} from "@/features/trip-actions";
import { ButtonLink } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { Sheet } from "@/ui/sheet";
import { Eyebrow, Headline, Num, Prose, Title } from "@/ui/text";
import type { OverviewView } from "./view";

/** The interrupt as it arrives on a phone: the claim, then one clear action. */
function MobileAdvisory({
  advisory,
}: {
  advisory: NonNullable<OverviewView["advisory"]>;
}) {
  return (
    <Panel accent="alert" className="overflow-hidden">
      <div className="flex items-center gap-2 px-3.5 pt-3">
        <Icon name="rain" size={15} className="text-alert" />
        <Eyebrow tone="alert">{advisory.kind}</Eyebrow>
      </div>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-1.5">
        <Title className="text-[16.5px]">{advisory.headline}</Title>
        <Prose>{advisory.affects}</Prose>
        <div className="flex gap-2">
          <ButtonLink
            href={advisory.href}
            variant="primary"
            size="lg"
            className="flex-1"
          >
            Replan my day
          </ButtonLink>
          <ButtonLink href={advisory.href} size="lg">
            Why?
          </ButtonLink>
        </div>
        {advisory.interventionId ? (
          <KeepPlanAction interventionId={advisory.interventionId} />
        ) : null}
      </div>
    </Panel>
  );
}

function MobileApplied({
  applied,
}: {
  applied: NonNullable<OverviewView["applied"]>;
}) {
  return (
    <Panel accent="ok" className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ok-line bg-ok-tint px-3.5 py-3">
        <span className="flex size-5 items-center justify-center rounded-full bg-ok text-on-accent">
          <Icon name="check" size={11} strokeWidth={2.6} />
        </span>
        <Eyebrow tone="ok">{applied.eyebrow}</Eyebrow>
      </div>
      <div className="flex flex-col gap-3 px-3.5 py-3.5">
        <Headline>{applied.headline}</Headline>
        <div className="flex flex-col gap-2">
          {applied.rows.map(({ from, to }) => (
            <div key={`${from}-${to}`} className="flex items-center gap-2.5">
              <Num className="w-[110px] truncate text-mini text-ink-faint line-through">
                {from}
              </Num>
              <Icon name="arrowRight" size={13} className="text-agent" />
              <Num className="flex-1 truncate text-mini font-semibold text-agent">
                {to}
              </Num>
            </div>
          ))}
        </div>
      </div>
      <Divider />
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <div className="flex-1">
          <div className="text-small font-medium">Changed your mind?</div>
          <div className="text-mini text-ink-faint">{applied.until}</div>
        </div>
        {applied.undoTripId ? <UndoButton tripId={applied.undoTripId} /> : null}
      </div>
    </Panel>
  );
}

function MobileCalm({ view }: { view: OverviewView }) {
  return (
    <Panel accent="ok" className="overflow-hidden">
      <div className="flex flex-col gap-2.5 px-4 pb-4 pt-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-[26px] items-center justify-center rounded-full bg-ok-tint text-ok">
            <Icon name="check" size={14} strokeWidth={2.2} />
          </span>
          <Eyebrow tone="ok">Nothing needs your attention</Eyebrow>
        </div>
        <Headline>{view.calmHeadline}</Headline>
        <Prose>{view.calmNote}</Prose>
        <Link
          href={`/trips/${view.trip.id}/watch`}
          className="text-small font-medium text-agent"
        >
          What I watch
        </Link>
      </div>
    </Panel>
  );
}

export function ActiveTripMobile({ view }: { view: OverviewView }) {
  const { trip, day, state } = view;
  const now = day.checkpoints.find((c) => c.state === "now");
  const next = day.checkpoints.find((c) => c.state === "upcoming");
  const done = day.checkpoints.filter((c) => c.state === "done").length;
  const left = day.checkpoints.length - done - (now ? 1 : 0);

  return (
    <div className="lg:hidden">
      <MobileHeader
        trip={trip}
        day={day.route}
        watch={view.forcePaused ? "paused" : "watching"}
      />

      <div className="absolute inset-x-3 top-[112px] z-20">
        <ConnectionSwitch
          sources={view.pausedSources}
          forceOffline={view.forcePaused}
        >
          {state === "advisory" && view.advisory ? (
            <MobileAdvisory advisory={view.advisory} />
          ) : null}
          {state === "applied" && view.applied ? (
            <MobileApplied applied={view.applied} />
          ) : null}
          {state === "calm" ? <MobileCalm view={view} /> : null}
        </ConnectionSwitch>
      </div>

      <Sheet className="absolute inset-x-0 bottom-20 z-20">
        <div className="flex items-start gap-2.5 px-4 pb-2.5 pt-1">
          <div className="flex flex-1 flex-col gap-0.5">
            <Eyebrow tone="agent">
              {now ? "Now" : day.state === "today" ? "Today" : day.stamp}
            </Eyebrow>
            <Title className="text-[16px]">{now?.title ?? day.summary}</Title>
          </div>
          {view.next ? (
            <div className="flex flex-col items-end gap-0.5">
              <Num className="text-small font-semibold">{view.next.time}</Num>
              <Eyebrow>{view.next.label}</Eyebrow>
            </div>
          ) : null}
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
          <Chip size="sm">
            {left} left {day.state === "today" ? "today" : ""}
          </Chip>
          <div className="flex-1" />
          <Link
            href={`/trips/${trip.id}/day/${day.id}`}
            className="text-mini font-medium text-agent"
          >
            Expand itinerary
          </Link>
        </div>

        <CommandBar
          tripId={view.askTripId ?? undefined}
          initialQuestion={view.initialQuestion}
          compact
          placeholder="Ask about your trip"
          className="mx-4 mb-3.5"
        />
      </Sheet>
    </div>
  );
}
