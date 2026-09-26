import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTrip, proposal, unchangedNodes } from "@/data/trip";
import { TopBar } from "@/features/chrome";
import { Button, ButtonLink } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { BasemapWeather } from "@/ui/map/basemap-weather";
import { BottomNav, tripTabs } from "@/ui/nav";
import { Eyebrow, Headline, Num } from "@/ui/text";
import { loadTrip } from "../load";

export const metadata: Metadata = { title: "Replanning" };

function CurrentRow({
  time,
  title,
  struck = false,
}: {
  time: string;
  title: string;
  struck?: boolean;
}) {
  return (
    <div
      className={`flex gap-3.5 px-[22px] py-2.5 ${struck ? "" : "opacity-50"}`}
    >
      <Num
        className={`w-[46px] text-small ${struck ? "text-ink-faint line-through" : ""}`}
      >
        {time}
      </Num>
      <span
        className={`flex-1 text-small ${struck ? "text-ink-faint line-through" : ""}`}
      >
        {title}
      </span>
    </div>
  );
}

export default async function ReplanPage({
  params,
}: PageProps<"/trips/[tripId]/replan">) {
  const { tripId } = await params;
  const trip = getTrip(tripId);
  if (!trip) {
    // A real trip's replan is made where its evidence is: the open alert's
    // before-and-after, or, with nothing proposed, the day editor.
    const { screen } = await loadTrip(tripId);
    const open = screen.alerts.alerts.find((a) => a.outcome === null);
    redirect(
      open
        ? `/trips/${tripId}/alerts/${open.id}`
        : `/trips/${tripId}/day/today`,
    );
  }

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 top-[58px] overflow-hidden">
        <BasemapWeather className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-canvas/55" />
      </div>

      <TopBar trip={trip} tabs={tripTabs(trip.id)} active="Map" />

      <main className="relative z-10 mx-auto w-full max-w-[1000px] px-4 pb-28 pt-5 lg:pb-10 lg:pt-11">
        <Panel className="overflow-hidden rounded-[16px]">
          <div className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:gap-3.5 lg:px-[22px]">
            <div className="flex flex-1 flex-col gap-1">
              <Eyebrow tone="agent">
                Replanning · driven by the 15:30 rain
              </Eyebrow>
              <Headline className="text-[21px]">
                Wednesday 16 September
              </Headline>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip size="sm">2 CHANGES</Chip>
              <Chip size="sm">COST UNCHANGED</Chip>
              <Chip size="sm" tone="ok">
                ENDS 40 MIN EARLIER
              </Chip>
            </div>
          </div>

          <Divider />

          {/*
            The diff is the intervention UI: the day as it stands on the left,
            the agent's proposal on the right, only the differences highlighted,
            and every changed line carrying its reason. You accept or reject the
            day as a unit — a half-applied day is an incoherent day.
          */}
          <div className="relative grid grid-cols-1 lg:grid-cols-2">
            <div
              aria-hidden="true"
              className="absolute inset-y-0 left-1/2 hidden w-px bg-hairline lg:block"
            />

            <div className="flex items-center gap-2 px-4 py-3 lg:px-[22px]">
              <Eyebrow>Current itinerary</Eyebrow>
            </div>
            <div className="flex items-center gap-2 border-t border-hairline px-4 py-3 lg:border-t-0 lg:px-[22px]">
              <Eyebrow tone="agent">AI proposal</Eyebrow>
              <span className="text-mini text-ink-faint">
                · only differences are highlighted
              </span>
            </div>

            {/* Unchanged head of the day. */}
            {unchangedNodes.slice(0, 2).map((node) => (
              <div key={node.time} className="contents">
                <CurrentRow time={node.time} title={node.title} />
                <div className="flex gap-3.5 px-[22px] py-2.5 opacity-50">
                  <Num className="w-[46px] text-small">{node.time}</Num>
                  <span className="flex-1 text-small">{node.title}</span>
                  <span className="text-mini text-ink-faint">unchanged</span>
                </div>
              </div>
            ))}

            {proposal.map((change) => (
              <div key={change.from.time} className="contents">
                <CurrentRow
                  time={change.from.time}
                  title={change.from.title}
                  struck
                />
                <div className="flex flex-col gap-1.5 bg-agent-tint px-[22px] pb-2.5 pt-1.5">
                  <div className="flex items-center gap-3.5">
                    <Num className="w-[46px] text-small font-semibold text-agent">
                      {change.to.time}
                    </Num>
                    <span className="flex-1 text-small font-semibold">
                      {change.to.title}
                    </span>
                    <Chip size="sm" tone="agent" className="bg-surface">
                      {change.delta}
                    </Chip>
                  </div>
                  <div className="flex gap-3.5">
                    <span className="w-[46px]" />
                    <span className="flex-1 text-mini text-ink-muted">
                      {change.because}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {unchangedNodes.slice(2).map((node) => (
              <div key={node.time} className="contents">
                <CurrentRow time={node.time} title={node.title} />
                <div className="flex gap-3.5 px-[22px] py-2.5 opacity-50">
                  <Num className="w-[46px] text-small">{node.time}</Num>
                  <span className="flex-1 text-small">{node.title}</span>
                  <span className="text-mini text-ink-faint">unchanged</span>
                </div>
              </div>
            ))}
          </div>

          <Divider />

          <div className="flex flex-col gap-2.5 px-4 py-3.5 lg:flex-row lg:items-center lg:px-[22px]">
            <div className="flex items-center gap-2.5">
              <Icon name="revert" size={15} className="text-ink-faint" />
              <span className="text-mini text-ink-faint">
                Nothing is applied until you say so · you can revert for 24
                hours
              </span>
            </div>
            <div className="flex-1" />
            <div className="flex flex-wrap gap-2.5">
              <ButtonLink href={`/trips/${trip.id}`} variant="ghost">
                Keep current plan
              </ButtonLink>
              <Button>Apply only the hike</Button>
              <ButtonLink
                href={`/trips/${trip.id}?state=applied`}
                variant="primary"
                className="px-5"
              >
                Apply both changes
              </ButtonLink>
            </div>
          </div>
        </Panel>
      </main>

      <BottomNav items={tripTabs(trip.id)} active="Map" />
    </div>
  );
}
