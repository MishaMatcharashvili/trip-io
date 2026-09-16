import type { Metadata } from "next";
import Link from "next/link";
import { finishedTrips, georgia, upcomingTrip } from "@/data/trip";
import { TopBar } from "@/features/chrome";
import { ButtonLink } from "@/ui/button";
import { Card, Divider, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BasemapCalm } from "@/ui/map/basemap-calm";
import { BasemapMobile } from "@/ui/map/basemap-mobile";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Display, Headline, Prose, Title } from "@/ui/text";

export const metadata: Metadata = { title: "Your trips" };

export default function TripsHome() {
  const trip = georgia;

  return (
    <>
      <TopBar active="Trips" />

      <main className="flex-1 pb-24 lg:pb-0">
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-6 lg:gap-6 lg:px-0 lg:py-10">
          <div className="flex items-start gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Display className="text-[25px] lg:text-[31px]">
                Your trips
              </Display>
              <Prose className="hidden lg:block">
                One trip is live right now. I am watching it.
              </Prose>
            </div>
            <ButtonLink href="/new" variant="primary" className="px-[18px]">
              <span className="hidden lg:inline">New trip</span>
              <span className="lg:hidden">New</span>
            </ButtonLink>
          </div>

          {/* Travelling now — the live trip carries its watch status and any
              pending decision, so the state of the product is visible before
              you open anything. */}
          <section className="flex flex-col gap-3">
            <SectionRule tone="agent">Travelling now</SectionRule>

            <Card
              accent="agent"
              className="flex flex-col overflow-hidden lg:flex-row lg:items-stretch"
            >
              <div className="relative h-[118px] shrink-0 overflow-hidden lg:h-auto lg:w-[296px]">
                <BasemapMobile className="absolute inset-0 size-full lg:hidden" />
                <BasemapCalm className="absolute inset-0 hidden size-full lg:block" />
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
                  <Chip tone="agent" size="sm">
                    Day {trip.currentDay}
                    <span className="hidden lg:inline">
                      {" "}
                      of {trip.dayCount}
                    </span>
                    <span className="lg:hidden">/{trip.dayCount}</span>
                  </Chip>
                </div>

                {/* Mobile: only the decision. Desktop: the whole detector row. */}
                <div className="flex items-start gap-2.5 rounded-control border border-alert-line bg-alert-tint px-3 py-2.5 lg:hidden">
                  <Dot tone="alert" className="mt-1.5" />
                  <div className="flex-1">
                    <div className="text-small font-semibold">
                      1 change needs your decision
                    </div>
                    <div className="text-mini text-ink-muted">
                      Rain at 15:30 conflicts with your 16:00 hike
                    </div>
                  </div>
                </div>

                <div className="hidden overflow-hidden rounded-[9px] border border-hairline lg:flex">
                  <div className="flex flex-1 items-center gap-2 bg-alert-tint px-3.5 py-2.5">
                    <Dot tone="alert" />
                    <div className="flex-1">
                      <div className="text-small font-semibold">
                        1 change needs your decision
                      </div>
                      <div className="text-mini text-ink-muted">
                        Rain at 15:30 conflicts with your 16:00 hike
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 border-l border-hairline px-3.5 py-2.5">
                    <Dot tone="ok" />
                    <span className="text-small text-ink-muted">
                      Roads clear
                    </span>
                  </div>
                  <div className="flex items-center gap-2 border-l border-hairline px-3.5 py-2.5">
                    <Dot tone="agent" />
                    <span className="text-small text-ink-muted">
                      2 nearby finds
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <ButtonLink
                    href={`/trips/${trip.id}/day/3`}
                    variant="primary"
                    className="flex-1 lg:flex-none"
                  >
                    Open today
                  </ButtonLink>
                  <ButtonLink href={`/trips/${trip.id}/trip`}>
                    <span className="hidden lg:inline">Full trip</span>
                    <span className="lg:hidden">Trip</span>
                  </ButtonLink>
                  <div className="hidden flex-1 lg:block" />
                  <span className="hidden text-mini text-ink-faint lg:inline">
                    Last checked {trip.lastCheck} · {trip.sourceCount} sources
                  </span>
                </div>

                <div className="flex items-center gap-1.5 lg:hidden">
                  <Dot tone="ok" breathe />
                  <span className="flex-1 text-mini text-ink-faint">
                    Watching {trip.sourceCount} sources · last check{" "}
                    {trip.lastCheck}
                  </span>
                </div>
              </div>
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <SectionRule>Coming up</SectionRule>
            <Card className="flex items-center gap-3 p-3.5 lg:gap-[18px] lg:px-5 lg:py-4">
              <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] border border-hairline bg-canvas text-ink-faint lg:size-11 lg:rounded-[10px]">
                <Icon name="photo" size={20} />
              </span>
              <div className="flex flex-1 flex-col gap-0.5">
                <Title className="text-small lg:text-[16px]">
                  {upcomingTrip.title}
                </Title>
                <span className="text-mini text-ink-faint">
                  {upcomingTrip.dates} · {upcomingTrip.status}
                </span>
              </div>
              <Chip size="sm" className="hidden lg:inline-flex">
                {upcomingTrip.watchNote}
              </Chip>
              <ButtonLink
                href="/new"
                size="sm"
                className="hidden lg:inline-flex"
              >
                Continue planning
              </ButtonLink>
              <Icon
                name="chevronRight"
                size={15}
                className="text-ink-faint lg:hidden"
              />
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <SectionRule>Finished</SectionRule>
            <Card className="overflow-hidden">
              {finishedTrips.map((finished, i) => (
                <div key={finished.id}>
                  {i > 0 ? <Divider /> : null}
                  <Link
                    href="/"
                    className="flex items-center gap-[18px] px-3.5 py-3 transition-colors hover:bg-canvas lg:px-5 lg:py-3.5"
                  >
                    <div className="flex flex-1 flex-col gap-0.5">
                      <Title className="text-small lg:text-title">
                        {finished.title}
                      </Title>
                      <span className="text-mini text-ink-faint">
                        {finished.dates}
                        <span className="lg:hidden"> · {finished.changes}</span>
                      </span>
                    </div>
                    <span className="hidden text-small text-ink-muted lg:inline">
                      {finished.changes}
                    </span>
                    <Icon
                      name="chevronRight"
                      size={15}
                      className="text-ink-faint"
                    />
                  </Link>
                </div>
              ))}
            </Card>
          </section>

          <div className="flex justify-center pt-2 lg:hidden">
            <Link href="/plans" className="text-small font-medium text-agent">
              Planning is free · see what watching costs
            </Link>
          </div>
        </div>
      </main>

      <BottomNav items={homeTabs} active="Trips" />
    </>
  );
}
