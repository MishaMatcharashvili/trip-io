import type { Metadata } from "next";
import { georgiaMapStops, getTrip, type Trip, todayWeather } from "@/data/trip";
import { dayKey } from "@/domain/trip/document";
import { TopBar, TripBottomNav } from "@/features/chrome";
import { DayAccordion, type DayRow } from "@/features/day-accordion";
import { DayEditor } from "@/features/day-editor";
import { CheckpointList } from "@/features/itinerary";
import { RoutedTripMap } from "@/features/routed-trip-map";
import { forecastRibbon } from "@/features/shared-reads";
import { AddDayButton } from "@/features/trip-actions";
import { firstParam, worthForecasting } from "@/features/trip-links";
import {
  centroid,
  duration,
  mapStops,
  tripStops,
  weatherView,
} from "@/features/trip-model";
import { Button, ButtonLink } from "@/ui/button";
import { Card, SectionRule } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import type { MapStop } from "@/ui/map/trip-map";
import { tripTabs } from "@/ui/nav";
import { Display, Eyebrow, Num } from "@/ui/text";
import { loadTrip, pickDay } from "../load";
import { DayPanel } from "./day-panel";

export const metadata: Metadata = { title: "The whole trip" };

type Stat = { label: string; value: string };

function WholeTrip({
  trip,
  stats,
  totals,
  stops,
  days,
  actions,
}: {
  trip: Trip;
  stats: Stat[];
  totals: Stat[];
  stops: MapStop[];
  /** The days, each opening in place. */
  days: React.ReactNode;
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
            Every day, with a watch status each. This is the table where the
            product stops being a planner: every row says not just what you are
            doing, but whether anything has moved under it. A day opens in
            place into its weather and its stops, and today opens first.
          */}
          {days}

          <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
        </main>

        <aside className="hidden w-[460px] shrink-0 flex-col border-l border-hairline bg-surface lg:flex">
          <div className="relative h-[470px] overflow-hidden border-b border-hairline">
            <RoutedTripMap
              stops={stops}
              className="absolute inset-0 size-full"
            />
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

      <TripBottomNav tripId={trip.id} active="Trip" />
    </div>
  );
}

export default async function FullTripPage({
  params,
  searchParams,
}: PageProps<"/trips/[tripId]/trip">) {
  const { tripId } = await params;
  const query = await searchParams;
  const wanted = firstParam(query.day);

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
        days={
          <DayAccordion
            tripId={fixture.id}
            rows={fixture.days.map((day): DayRow => {
              const conflict = day.checkpoints.some((c) => c.conflict);
              return {
                day,
                // The reference trip's "today" is its third day.
                open: day.id === (!wanted || wanted === "today" ? "3" : wanted),
                panel: (
                  <DayPanel
                    weather={
                      conflict
                        ? { hours: todayWeather, caption: "Rain 15:30–19:00" }
                        : null
                    }
                    recommended={
                      conflict ? `/trips/${fixture.id}/replan` : null
                    }
                    briefingHref={
                      day.state === "today"
                        ? `/trips/${fixture.id}/briefing`
                        : null
                    }
                  >
                    <Card className="overflow-hidden">
                      <CheckpointList
                        day={day}
                        trip={fixture}
                        divided
                        linkPlaces
                      />
                    </Card>
                    <div className="flex gap-2.5 pt-1">
                      <Button className="flex-1 lg:flex-none">
                        Add a stop
                      </Button>
                      <Button className="flex-1 lg:flex-none">Reorder</Button>
                    </div>
                  </DayPanel>
                ),
              };
            })}
          />
        }
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
  const stops = tripStops(trip);
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

  const openDay = pickDay(trip, wanted) ?? trip.days[trip.currentDay - 1];
  const today = dayKey(new Date());
  // An open recommendation touches the days its matched stops are on.
  const recommendation = screen.alerts.alerts.find((a) => a.outcome === null);

  const rows = await Promise.all(
    trip.days.map(async (day): Promise<DayRow> => {
      const near = centroid(mapStops(day));
      const forecast =
        near && day.date && worthForecasting(day.date, today)
          ? await forecastRibbon(near, day.date)
          : null;
      const touched = new Set(day.checkpoints.map((c) => c.id));
      const conflicted = screen.matches.some((m) => touched.has(m.nodeId));
      const isOpen = day.id === openDay?.id;

      return {
        day,
        open: isOpen,
        panel: (
          <DayPanel
            weather={forecast ? weatherView(forecast) : null}
            recommended={
              recommendation && conflicted
                ? `/trips/${trip.id}/alerts/${recommendation.id}`
                : null
            }
            briefingHref={
              day.state === "today" ? `/trips/${trip.id}/briefing` : null
            }
          >
            {day.date ? (
              <DayEditor
                tripId={trip.id}
                head={screen.head}
                date={day.date}
                stops={day.checkpoints}
                near={near}
                openAdd={isOpen && firstParam(query.add) === "1"}
                initialQuery={isOpen ? firstParam(query.q) : undefined}
              />
            ) : null}
          </DayPanel>
        ),
      };
    }),
  );

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
      stops={stops}
      days={<DayAccordion tripId={trip.id} rows={rows} />}
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
