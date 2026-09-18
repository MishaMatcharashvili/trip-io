import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrip } from "@/data/trip";
import { AccountButton } from "@/features/chrome";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BasemapMobileRoute } from "@/ui/map/basemap-mobile-route";
import { BottomNav, tripTabs } from "@/ui/nav";
import { Display, Eyebrow, Num, Prose } from "@/ui/text";

export const metadata: Metadata = { title: "Your briefing" };

/**
 * 07:30 Tbilisi. One model call per live trip-day, bundling everything the
 * router sent to the briefing plus the shape of the day ahead — three things
 * to know, and at most one change worth making.
 */
const lines = [
  {
    tone: "alert" as const,
    kind: "Weather",
    title: "Clear now, rain from 16:00",
    detail: "12 mm, easing by 19:00 · 8°C on the ridge",
  },
  {
    tone: "ok" as const,
    kind: "Transport",
    title: "No transport issues on your route",
    detail: "Military Highway open · marshrutka running normally",
  },
  {
    tone: "agent" as const,
    kind: "Local",
    title: "Sheep migration festival in Sno, 18:00",
    detail: "6 min from your dinner · free entry",
  },
];

export default async function BriefingPage({
  params,
}: PageProps<"/trips/[tripId]/briefing">) {
  const { tripId } = await params;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  const day = trip.days[trip.currentDay - 1];

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="absolute inset-x-0 top-0 h-[270px] overflow-hidden">
        <BasemapMobileRoute className="absolute inset-0 size-full" />
        <div className="absolute inset-0 bg-linear-to-b from-canvas/55 to-transparent" />
      </div>

      <div className="absolute inset-x-4 top-14 z-20 flex items-center gap-2.5">
        <Chip tone="ok" floating>
          <Dot tone="ok" breathe />
          Watching · {trip.sourceCount} sources
        </Chip>
        <div className="flex-1" />
        <AccountButton floating />
      </div>

      <main className="relative z-10 mt-[214px] flex flex-1 flex-col rounded-t-[20px] border-t border-hairline bg-surface shadow-sheet lg:mx-auto lg:mt-[240px] lg:w-[560px] lg:rounded-[20px] lg:border">
        <div className="flex flex-col gap-1.5 px-[18px] pb-3.5 pt-5">
          <Eyebrow>
            Day {day.index} · {day.stamp.split(" · ")[1]} ·{" "}
            {day.route.split(" → ").at(-1)}
          </Eyebrow>
          <Display className="text-[26px]">Good morning, Misha</Display>
          <Prose>
            Dry until mid-afternoon, roads clear, and one thing worth moving.
          </Prose>
        </div>

        <div className="flex flex-col border-t border-hairline px-[18px]">
          {lines.map((line, i) => (
            <div
              key={line.title}
              className={cx(
                "flex items-start gap-3 py-3.5",
                i > 0 && "border-t border-hairline",
              )}
            >
              <Dot tone={line.tone} className="mt-1.5" />
              <div className="flex-1">
                <div className="text-small font-medium">{line.title}</div>
                <div className="text-mini text-ink-faint">{line.detail}</div>
              </div>
              <Eyebrow className="pt-0.5">{line.kind}</Eyebrow>
            </div>
          ))}
        </div>

        <Card
          tint
          accent="agent"
          className="mx-[18px] mt-4 flex flex-col gap-3 p-3.5"
        >
          <div className="flex items-center gap-2">
            <Icon name="sparkle" size={15} className="text-agent" />
            <Eyebrow tone="agent">1 change recommended</Eyebrow>
          </div>
          <p className="text-small">
            Move the{" "}
            <span className="font-semibold">Gergeti hike to 11:30</span> and the
            museum to the afternoon. Everything else holds.
          </p>
          <div className="flex items-center gap-2">
            <Num className="text-mini text-ink-faint line-through">
              16:00 HIKE
            </Num>
            <Icon name="arrowRight" size={14} className="text-agent" />
            <Num className="text-mini font-medium text-agent">11:30 HIKE</Num>
          </div>
        </Card>

        <div className="flex-1" />

        <div className="flex flex-col gap-2.5 px-[18px] pb-[18px] pt-4">
          <ButtonLink
            href={`/trips/${trip.id}/replan`}
            variant="primary"
            size="lg"
            block
          >
            Optimise my day
          </ButtonLink>
          <div className="flex justify-center gap-4">
            <ButtonLink
              href={`/trips/${trip.id}/day/${day.id}`}
              variant="ghost"
              size="sm"
            >
              See full day
            </ButtonLink>
            <ButtonLink href={`/trips/${trip.id}`} variant="ghost" size="sm">
              Ask something
            </ButtonLink>
          </div>
        </div>
      </main>

      <div className="h-20 lg:hidden" />
      <BottomNav items={tripTabs(trip.id)} active="Today" />
    </div>
  );
}
