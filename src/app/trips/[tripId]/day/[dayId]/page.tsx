import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { dayForecast } from "@/bll/trip-screen";
import {
  type Day,
  getDay,
  getTrip,
  type Trip,
  todayWeather,
} from "@/data/trip";
import { MobileTitleBar, TopBar } from "@/features/chrome";
import { DayEditor } from "@/features/day-editor";
import { CheckpointList } from "@/features/itinerary";
import { mapStops, weatherView } from "@/features/trip-model";
import { WeatherRibbon } from "@/ui/bars";
import { Button, ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { BottomNav, tripTabs } from "@/ui/nav";
import { Display, Eyebrow } from "@/ui/text";
import { loadTrip, pickDay } from "../../load";

export const metadata: Metadata = { title: "Day" };

type Weather = {
  hours: Parameters<typeof WeatherRibbon>[0]["hours"];
  caption: string;
  captionTone?: "alert" | "neutral";
} | null;

function DayScreen({
  trip,
  day,
  weather,
  recommended,
  children,
}: {
  trip: Trip;
  day: Day;
  weather: Weather;
  /** Where an open recommendation for this day is reviewed, if there is one. */
  recommended: string | null;
  children: React.ReactNode;
}) {
  const done = day.checkpoints.filter((c) => c.state === "done").length;
  const previous = trip.days[day.index - 2];
  const next = trip.days[day.index];

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar trip={trip} tabs={tripTabs(trip.id)} active="Today" />

      <MobileTitleBar
        back={`/trips/${trip.id}/trip`}
        title={day.title}
        eyebrow={`Day ${day.index} of ${trip.dayCount} · ${day.route}`}
        trailing={
          <Chip size="sm">
            {done}/{day.checkpoints.length} done
          </Chip>
        }
      />

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-3 px-4 pb-32 pt-3 lg:pb-8 lg:pt-6">
        <div className="hidden items-start gap-4 lg:flex">
          <div className="flex flex-1 flex-col gap-1.5">
            <Eyebrow>
              Day {day.index} of {trip.dayCount} · {day.route}
            </Eyebrow>
            <Display className="text-[26px]">{day.title}</Display>
          </div>
          <Chip>
            {done}/{day.checkpoints.length} done
          </Chip>
        </div>

        <div className="flex items-center gap-2">
          {previous ? (
            <Link
              href={`/trips/${trip.id}/day/${previous.id}`}
              className="flex items-center gap-1 text-small text-ink-muted hover:text-ink"
            >
              <Icon name="chevronLeft" size={14} />
              Day {previous.index}
            </Link>
          ) : null}
          <div className="flex-1" />
          {next ? (
            <Link
              href={`/trips/${trip.id}/day/${next.id}`}
              className="flex items-center gap-1 text-small text-ink-muted hover:text-ink"
            >
              Day {next.index}
              <Icon name="chevronRight" size={14} />
            </Link>
          ) : null}
        </div>

        {/* The day's weather above the day's plan — a conflict you can see as a
            shape before you read a word of it. */}
        {weather ? (
          <Card className="px-3.5 py-3">
            <WeatherRibbon
              hours={weather.hours}
              caption={weather.caption}
              captionTone={weather.captionTone}
            />
          </Card>
        ) : null}

        {children}
      </main>

      {recommended ? (
        <Card
          tint
          accent="agent"
          className="fixed inset-x-4 bottom-24 z-20 flex items-center gap-3 px-3.5 py-2.5 lg:static lg:mx-auto lg:mb-8 lg:w-full lg:max-w-[720px]"
        >
          <Icon name="sparkle" size={16} className="text-agent" />
          <span className="flex-1 text-small font-medium">
            1 change recommended for this day
          </span>
          <ButtonLink href={recommended} variant="primary" size="sm">
            Review
          </ButtonLink>
        </Card>
      ) : null}

      <div className="flex justify-center pb-24 lg:hidden">
        <Link
          href={`/trips/${trip.id}/briefing`}
          className="text-small font-medium text-agent"
        >
          This morning&rsquo;s briefing
        </Link>
      </div>

      <BottomNav items={tripTabs(trip.id)} active="Today" />
    </div>
  );
}

export default async function DayPage({
  params,
  searchParams,
}: PageProps<"/trips/[tripId]/day/[dayId]">) {
  const { tripId, dayId } = await params;
  const { add } = await searchParams;

  const fixture = getTrip(tripId);
  if (fixture) {
    const day = getDay(fixture, dayId === "today" ? "3" : dayId);
    if (!day) notFound();
    const conflict = day.checkpoints.some((c) => c.conflict);
    return (
      <DayScreen
        trip={fixture}
        day={day}
        weather={
          conflict ? { hours: todayWeather, caption: "Rain 15:30–19:00" } : null
        }
        recommended={conflict ? `/trips/${fixture.id}/replan` : null}
      >
        <Card className="overflow-hidden">
          <CheckpointList day={day} trip={fixture} divided linkPlaces />
        </Card>
        <div className="flex gap-2.5 pt-1">
          <Button className="flex-1 lg:flex-none">Add a stop</Button>
          <Button className="flex-1 lg:flex-none">Reorder</Button>
        </div>
      </DayScreen>
    );
  }

  const { screen, trip } = await loadTrip(tripId);
  const day = pickDay(trip, dayId);
  if (!day?.date) notFound();

  const stops = mapStops(day);
  const near: [number, number] | null = stops.length
    ? [
        stops.reduce((s, p) => s + p.lonLat[0], 0) / stops.length,
        stops.reduce((s, p) => s + p.lonLat[1], 0) / stops.length,
      ]
    : null;
  const forecast = near ? await dayForecast(near, day.date) : null;

  // An open recommendation that touches this day: the review card.
  const touched = new Set(day.checkpoints.map((c) => c.id));
  const open = screen.alerts.alerts.find((a) => a.outcome === null);
  const conflicted = screen.matches.some((m) => touched.has(m.nodeId));

  return (
    <DayScreen
      trip={trip}
      day={day}
      weather={forecast ? weatherView(forecast) : null}
      recommended={
        open && conflicted ? `/trips/${trip.id}/alerts/${open.id}` : null
      }
    >
      <DayEditor
        tripId={trip.id}
        head={screen.head}
        date={day.date}
        stops={day.checkpoints}
        near={near}
        openAdd={add === "1"}
      />
    </DayScreen>
  );
}
