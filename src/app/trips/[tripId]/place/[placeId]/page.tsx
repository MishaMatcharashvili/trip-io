import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrip } from "@/data/trip";
import { Button } from "@/ui/button";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BasemapMobile } from "@/ui/map/basemap-mobile";
import { Display, Eyebrow, Num, Prose } from "@/ui/text";

export const metadata: Metadata = { title: "Checkpoint" };

const stats = [
  { label: "Scheduled", value: "16:00" },
  { label: "Return", value: "2h 40m" },
  { label: "Ascent", value: "400 m" },
  { label: "Grade", value: "Moderate" },
];

/**
 * What the watch layer follows for this checkpoint specifically. It is the
 * difference between "we monitor your trip" and a claim you can audit.
 */
const watched = [
  {
    name: "Weather on the ridge",
    tone: "alert" as const,
    status: "1 change today",
  },
  {
    name: "Trail condition reports",
    tone: "ok" as const,
    status: "Clear · 3 h ago",
  },
  {
    name: "Church opening hours",
    tone: "ok" as const,
    status: "Verified · 2 h ago",
  },
];

export default async function PlacePage({
  params,
}: PageProps<"/trips/[tripId]/place/[placeId]">) {
  const { tripId, placeId } = await params;
  const trip = getTrip(tripId);
  const day = trip?.days.find((d) =>
    d.checkpoints.some((c) => c.id === placeId),
  );
  const checkpoint = day?.checkpoints.find((c) => c.id === placeId);
  if (!trip || !day || !checkpoint) notFound();

  const position = day.checkpoints.indexOf(checkpoint) + 1;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="absolute inset-x-0 top-0 h-[230px] overflow-hidden">
        <BasemapMobile className="absolute inset-0 size-full" />
      </div>

      <div className="absolute inset-x-4 top-13 z-20 flex items-center gap-2.5">
        <Link
          href={`/trips/${trip.id}/day/${day.id}`}
          aria-label="Back to the day"
          className="flex size-[38px] items-center justify-center rounded-[10px] border border-hairline-strong bg-surface text-ink-muted shadow-panel"
        >
          <Icon name="chevronLeft" size={18} />
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Save this place"
          className="flex size-[38px] items-center justify-center rounded-[10px] border border-hairline-strong bg-surface text-ink-muted shadow-panel"
        >
          <Icon name="bookmark" size={17} />
        </button>
      </div>

      <main className="relative z-10 mt-[194px] flex flex-1 flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet lg:mx-auto lg:mt-[220px] lg:w-[560px] lg:rounded-sheet lg:border">
        <div className="flex flex-col gap-1.5 px-[18px] pb-3.5 pt-[18px]">
          <Eyebrow tone="agent">
            Checkpoint {position} of {day.checkpoints.length} ·{" "}
            {day.title.split(" ")[0]}
          </Eyebrow>
          <Display className="text-[26px]">Gergeti Trinity Church</Display>
          <Prose>
            A 14th-century church on a spur above Stepantsminda, at 2,170 m.
          </Prose>
        </div>

        <div className="flex gap-0 border-b border-hairline px-[18px] pb-3.5">
          {stats.map((stat) => (
            <div key={stat.label} className="flex flex-1 flex-col gap-0.5">
              <Eyebrow>{stat.label}</Eyebrow>
              <Num className="text-small font-semibold">{stat.value}</Num>
            </div>
          ))}
        </div>

        {checkpoint.conflict ? (
          <div className="flex flex-col gap-3 border-b border-hairline px-[18px] py-3.5">
            <div className="flex items-start gap-3 rounded-[9px] border border-alert-line bg-alert-tint px-3.5 py-3">
              <Dot tone="alert" className="mt-1.5" />
              <div className="flex-1">
                <div className="text-small font-semibold">
                  Scheduled inside the rain window
                </div>
                <div className="text-mini text-ink-muted">
                  12 mm from 15:30. The ridge is exposed the whole way up and
                  the track gets slick above the treeline.
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <Button variant="primary" size="lg" className="flex-1">
                Move to 11:30
              </Button>
              <Button size="lg">Other times</Button>
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2.5 border-b border-hairline px-[18px] py-3.5">
          <Eyebrow>What I keep an eye on here</Eyebrow>
          <div className="flex flex-col">
            {watched.map((item, i) => (
              <div
                key={item.name}
                className={cx(
                  "flex items-center gap-3 py-[7px]",
                  i > 0 && "border-t border-track",
                )}
              >
                <Dot tone={item.tone} />
                <span className="flex-1 text-small text-ink-muted">
                  {item.name}
                </span>
                <span className="text-mini text-ink-faint">{item.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5 px-[18px] py-3.5">
          <Eyebrow>Why it is in your trip</Eyebrow>
          <Prose>
            The one place in your week that is both nature and a monastery.
            Placed on day {day.index} because it is the only moderate climb and
            you are rested by then.
          </Prose>
        </div>

        <div className="flex-1" />

        <div className="flex gap-2.5 border-t border-hairline px-[18px] pb-[22px] pt-3">
          <Button size="lg" className="flex-1">
            Directions
          </Button>
          <Button size="lg" className="flex-1">
            Ask about it
          </Button>
          <Button variant="ghost" size="lg" className="px-3">
            Remove
          </Button>
        </div>
      </main>
    </div>
  );
}
