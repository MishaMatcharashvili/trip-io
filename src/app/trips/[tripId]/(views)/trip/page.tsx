import type { Metadata } from "next";
import { georgiaMapStops, getTrip, type Trip, todayWeather } from "@/data/trip";
import { dayKey } from "@/domain/trip/document";
import { DayAccordion, type DayRow } from "@/features/day-accordion";
import { DayEditor } from "@/features/day-editor";
import { DayStrip } from "@/features/day-strip";
import { chipsFor } from "@/features/day-strip-model";
import { dayTiming } from "@/features/day-timing";
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
import { Card } from "@/ui/card";
import { Icon } from "@/ui/icon";
import type { MapStop } from "@/ui/map/trip-map";
import { loadTrip, pickDay } from "../../load";
import { DayPanel } from "./day-panel";
import {
  type Figure,
  figures,
  STAT_LABELS,
  TOTAL_LABELS,
  WholeTripShell,
} from "./shell";

export const metadata: Metadata = { title: "The whole trip" };

function WholeTrip({
  trip,
  stats,
  totals,
  stops,
  switcher,
  days,
  actions,
}: {
  trip: Trip;
  stats: Figure[];
  totals: Figure[];
  stops: MapStop[];
  switcher?: React.ReactNode;
  /** The days, each opening in place. */
  days: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <WholeTripShell
      eyebrow={`${trip.dates} · ${trip.dayCount} days · ${trip.party}`}
      stats={stats}
      totals={totals}
      map={
        <RoutedTripMap stops={stops} className="absolute inset-0 size-full" />
      }
      switcher={switcher}
      days={days}
      actions={actions}
    />
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

  // The switcher's choice. A day named in the URL is the one the map shows and
  // the list opens; "all" is every stop and no day open; with nothing asked for,
  // the map has every stop and today's row is the one that is open.
  const everyDay = wanted === "all";
  const chosen = everyDay ? undefined : pickDay(trip, wanted);
  const focused = wanted ? chosen : undefined;
  const openDay = everyDay
    ? undefined
    : (chosen ?? trip.days[trip.currentDay - 1]);
  const stops = focused ? mapStops(focused) : tripStops(trip);
  const today = dayKey(new Date());
  // An open recommendation touches the days its matched stops are on.
  const recommendation = screen.alerts.alerts.find((a) => a.outcome === null);

  // What is wrong with each day's times, and the room between its stops: one
  // read of the document, for every day's panel.
  const timing = dayTiming(screen.doc, screen.places);

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
                problems={timing.problems.get(day.date) ?? []}
                gaps={Object.fromEntries(
                  day.checkpoints.flatMap((c) =>
                    timing.gaps[c.id] ? [[c.id, timing.gaps[c.id]]] : [],
                  ),
                )}
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
      stats={figures(STAT_LABELS, [
        screen.doc.trip.budget || "—",
        String(places),
        String(applied),
      ])}
      totals={figures(TOTAL_LABELS, [
        driving ? `${duration(driving)} total` : "None planned",
        busiest.visits
          ? `Day ${busiest.index} · ${busiest.visits} visits`
          : "—",
        String(nodes.length),
        told ? `${told} · ${applied} applied` : "None yet",
      ])}
      stops={stops}
      switcher={
        trip.days.length > 1 ? (
          <DayStrip
            tripId={trip.id}
            chips={chipsFor(trip.days)}
            selected={focused?.id ?? "all"}
            page="plan"
          />
        ) : null
      }
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
