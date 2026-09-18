import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDay, getTrip, todayWeather } from "@/data/trip";
import { MobileTitleBar, TopBar } from "@/features/chrome";
import { CheckpointList } from "@/features/itinerary";
import { WeatherRibbon } from "@/ui/bars";
import { Button, ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { BottomNav, tripTabs } from "@/ui/nav";
import { Display, Eyebrow } from "@/ui/text";

export const metadata: Metadata = { title: "Day" };

export default async function DayPage({
  params,
}: PageProps<"/trips/[tripId]/day/[dayId]">) {
  const { tripId, dayId } = await params;
  const trip = getTrip(tripId);
  const day = trip && getDay(trip, dayId);
  if (!trip || !day) notFound();

  const done = day.checkpoints.filter((c) => c.state === "done").length;
  const hasConflict = day.checkpoints.some((c) => c.conflict);

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

        {/* The day's weather above the day's plan — a conflict you can see as a
            shape before you read a word of it. */}
        {hasConflict ? (
          <Card className="px-3.5 py-3">
            <WeatherRibbon hours={todayWeather} caption="Rain 15:30–19:00" />
          </Card>
        ) : null}

        <Card className="overflow-hidden">
          <CheckpointList day={day} trip={trip} divided linkPlaces />
        </Card>

        <div className="flex gap-2.5 pt-1">
          <Button className="flex-1 lg:flex-none">Add a stop</Button>
          <Button className="flex-1 lg:flex-none">Reorder</Button>
        </div>
      </main>

      {hasConflict ? (
        <Card
          tint
          accent="agent"
          className="fixed inset-x-4 bottom-24 z-20 flex items-center gap-3 px-3.5 py-2.5 lg:static lg:mx-auto lg:mb-8 lg:w-full lg:max-w-[720px]"
        >
          <Icon name="sparkle" size={16} className="text-agent" />
          <span className="flex-1 text-small font-medium">
            1 change recommended for today
          </span>
          <ButtonLink
            href={`/trips/${trip.id}/replan`}
            variant="primary"
            size="sm"
          >
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
