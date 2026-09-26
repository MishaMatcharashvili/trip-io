import type { Metadata } from "next";
import Link from "next/link";
import { georgiaMapStops, getTrip, type Trip } from "@/data/trip";
import { TopBar } from "@/features/chrome";
import { AddDayButton } from "@/features/trip-actions";
import { duration, tripStops } from "@/features/trip-model";
import { DayShape } from "@/ui/bars";
import { Button, ButtonLink } from "@/ui/button";
import { Card, Divider, SectionRule } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { type MapStop, TripMap } from "@/ui/map/trip-map";
import { BottomNav, tripTabs } from "@/ui/nav";
import { Display, Eyebrow, Num } from "@/ui/text";
import { loadTrip } from "../load";

export const metadata: Metadata = { title: "The whole trip" };

type Stat = { label: string; value: string };

function WholeTrip({
  trip,
  stats,
  totals,
  stops,
  actions,
}: {
  trip: Trip;
  stats: Stat[];
  totals: Stat[];
  stops: MapStop[];
  actions: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar trip={trip} tabs={tripTabs(trip.id)} active="Trip" />

      <div className="flex min-h-0 flex-1 items-stretch">
        <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pb-24 pt-6 lg:px-8 lg:py-7 lg:pb-7">
          <div className="flex items-start gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Eyebrow>
                {trip.dates} · {trip.dayCount} days · {trip.party}
              </Eyebrow>
              <Display className="text-[24px] lg:text-[29px]">
                The whole trip
              </Display>
            </div>
            <div className="hidden gap-5 lg:flex">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-end gap-0.5"
                >
                  <Eyebrow>{stat.label}</Eyebrow>
                  <Num className="text-[16px] font-semibold">{stat.value}</Num>
                </div>
              ))}
            </div>
          </div>

          {/*
            Every day with a watch status each. This is the table where the
            product stops being a planner: every row says not just what you are
            doing, but whether anything has moved under it.
          */}
          <Card className="overflow-hidden">
            <div className="hidden items-center gap-3.5 border-b border-hairline bg-surface-subtle px-[18px] py-2.5 lg:flex">
              <Eyebrow className="flex-1">Day</Eyebrow>
              <Eyebrow className="w-[250px]">Shape of the day</Eyebrow>
              <Eyebrow className="w-[120px]">Watch status</Eyebrow>
            </div>

            {trip.days.map((day, i) => (
              <div key={day.id}>
                {i > 0 ? <Divider /> : null}
                <Link
                  href={`/trips/${trip.id}/day/${day.id}`}
                  className={cx(
                    "flex flex-col gap-2.5 px-4 py-3 transition-colors lg:flex-row lg:items-center lg:gap-3.5 lg:px-[18px]",
                    day.state === "past" && "opacity-55",
                    day.state === "today" &&
                      "border-l-[3px] border-agent bg-agent-tint",
                    day.state !== "today" && "hover:bg-canvas",
                  )}
                >
                  <div className="flex flex-1 flex-col gap-0.5">
                    <Num
                      className={cx(
                        "text-mini",
                        day.state === "today"
                          ? "font-semibold text-agent"
                          : "text-ink-faint",
                      )}
                    >
                      {day.stamp}
                    </Num>
                    <span
                      className={cx(
                        "text-small",
                        day.state === "today" ? "font-semibold" : "font-medium",
                      )}
                    >
                      {day.summary}
                    </span>
                  </div>

                  <DayShape
                    segments={day.shape}
                    className="w-full lg:w-[250px]"
                  />

                  <div className="flex w-[120px] items-center gap-2">
                    <Dot tone={day.watch.tone} />
                    <span
                      className={cx(
                        "text-mini",
                        day.watch.tone === "alert"
                          ? "font-medium text-alert"
                          : day.watch.tone === "agent"
                            ? "text-agent"
                            : "text-ink-faint",
                      )}
                    >
                      {day.watch.label}
                    </span>
                  </div>
                </Link>
              </div>
            ))}
          </Card>

          <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
        </main>

        <aside className="hidden w-[460px] shrink-0 flex-col border-l border-hairline bg-surface lg:flex">
          <div className="relative h-[470px] overflow-hidden border-b border-hairline">
            <TripMap stops={stops} className="absolute inset-0 size-full" />
          </div>
          <div className="flex flex-col gap-4 px-[26px] py-[22px]">
            <SectionRule>Across the whole trip</SectionRule>
            <div className="flex flex-col">
              {totals.map((total, i) => (
                <div
                  key={total.label}
                  className={cx(
                    "flex items-center gap-3 py-2.5",
                    i > 0 && "border-t border-track",
                  )}
                >
                  <span className="flex-1 text-small text-ink-muted">
                    {total.label}
                  </span>
                  <Num className="text-small font-semibold">{total.value}</Num>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <BottomNav items={tripTabs(trip.id)} active="Trip" />
    </div>
  );
}

export default async function FullTripPage({
  params,
}: PageProps<"/trips/[tripId]/trip">) {
  const { tripId } = await params;

  const fixture = getTrip(tripId);
  if (fixture) {
    return (
      <WholeTrip
        trip={fixture}
        stats={[
          { label: "Budget", value: "€640 / 700" },
          { label: "Places", value: "31" },
          { label: "Changes handled", value: "6" },
        ]}
        totals={[
          { label: "Driving", value: "7h 40m total" },
          { label: "Longest day on foot", value: "Day 4 · 11 km" },
          { label: "Bookings held", value: "5" },
          { label: "Changes I proposed", value: "8 · 6 applied" },
        ]}
        stops={georgiaMapStops}
        actions={
          <>
            <Button>Add a day</Button>
            <Button>Reorder trip</Button>
            <div className="flex-1" />
            <Button variant="ghost">Export itinerary</Button>
          </>
        }
      />
    );
  }

  const { screen, trip } = await loadTrip(tripId);
  const nodes = Object.values(screen.doc.nodes);
  const driving = nodes
    .filter((n) => n.kind === "transfer")
    .reduce((sum, n) => sum + n.durationMin, 0);
  const busiest = trip.days.reduce(
    (best, day) => {
      const visits = day.checkpoints.filter(
        (c) => c.node?.kind === "visit",
      ).length;
      return visits > best.visits ? { index: day.index, visits } : best;
    },
    { index: 0, visits: 0 },
  );
  const places = new Set(nodes.flatMap((n) => (n.placeId ? [n.placeId] : [])))
    .size;
  const { told, applied } = screen.alerts;

  return (
    <WholeTrip
      trip={trip}
      stats={[
        { label: "Budget", value: screen.doc.trip.budget || "—" },
        { label: "Places", value: String(places) },
        { label: "Changes handled", value: String(applied) },
      ]}
      totals={[
        {
          label: "Driving",
          value: driving ? `${duration(driving)} total` : "None planned",
        },
        {
          label: "Busiest day",
          value: busiest.visits
            ? `Day ${busiest.index} · ${busiest.visits} visits`
            : "—",
        },
        { label: "Stops", value: String(nodes.length) },
        {
          label: "Changes I proposed",
          value: told ? `${told} · ${applied} applied` : "None yet",
        },
      ]}
      stops={tripStops(trip)}
      actions={
        <>
          <AddDayButton
            tripId={trip.id}
            head={screen.head}
            endsAt={screen.doc.trip.endsAt}
          />
          <ButtonLink href={`/trips/${trip.id}/history`}>
            <Icon name="revert" size={14} />
            Change history
          </ButtonLink>
          <div className="flex-1" />
          <a
            href={`/api/trips/${trip.id}/itinerary.ics`}
            download
            className="inline-flex h-[38px] items-center gap-2 rounded-control px-[15px] text-[13px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <Icon name="calendar" size={14} />
            Export itinerary
          </a>
        </>
      }
    />
  );
}
