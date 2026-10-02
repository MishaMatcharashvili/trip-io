import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { myTrips, type TripListRow, tripScreen } from "@/bll/trip-screen";
import { passesHeldBy } from "@/bll/watch-pass";
import { georgia, georgiaMapStops } from "@/data/trip";
import { dayKey } from "@/domain/trip/document";
import { HomePlan } from "@/features/home-plan";
import { PageColumn } from "@/features/page-column";
import { tbilisiToday } from "@/features/shared-reads";
import { SiteFrame } from "@/features/site-frame";
import { type Hero, TripHero } from "@/features/trip-hero";
import { dateRange, tripModel, tripStops } from "@/features/trip-model";
import {
  orderTrips,
  pickFeatured,
  startsIn,
  type TripState,
} from "@/features/trip-picker-model";
import { TripSwitcher } from "@/features/trip-switcher";
import { getAuth } from "@/infra/auth";
import { Card, SectionRule } from "@/ui/card";
import { Headline, Prose } from "@/ui/text";
import { HomeHeading } from "./home-heading";

export const metadata: Metadata = { title: "Your trips" };

/** The featured trip as its card shows it: its map, its state and its watch. */
async function heroFor(
  row: TripListRow & { state: TripState },
  watched: boolean,
  today: string,
): Promise<Hero | null> {
  const screen = await tripScreen(row.id);
  if (!screen) return null;
  const trip = tripModel(screen);
  const open = screen.alerts.alerts.find((a) => a.outcome === null);
  const family = (prefix: string, name: string) => ({
    name,
    tone: screen.matches.some((m) => m.kind.startsWith(prefix))
      ? ("alert" as const)
      : screen.watch
        ? ("ok" as const)
        : ("idle" as const),
  });
  return {
    trip,
    stops: tripStops(trip),
    state: row.state,
    startsIn: startsIn(row.startsAt, today),
    decision: open
      ? {
          title: "1 change needs your decision",
          detail: open.title,
          href: `/trips/${row.id}/alerts/${open.id}`,
        }
      : null,
    detectors: [family("weather", "Weather"), family("road", "Roads")],
    watched,
    applied: row.applied,
  };
}

/** The first thing on the page for someone with no trip: what this is for. */
function Welcome() {
  return (
    <Card className="flex flex-col gap-3 p-5 lg:p-7">
      <Headline className="text-[20px] lg:text-[24px]">
        Plan a trip through Georgia, and I will watch it for you
      </Headline>
      <Prose>
        Tell me where and when. I build the days from places I have checked,
        then watch the weather and roads around every stop and tell you only
        when something should change.
      </Prose>
    </Card>
  );
}

export default async function TripsHome({ searchParams }: PageProps<"/">) {
  const { trip: wanted } = await searchParams;
  const session = await getAuth().api.getSession({ headers: await headers() });
  const [rows, passes, planDate] = await Promise.all([
    session ? myTrips(session.user.id) : Promise.resolve([]),
    session ? passesHeldBy(session.user.id) : Promise.resolve([]),
    tbilisiToday(),
  ]);

  const today = dayKey(new Date());
  const ordered = orderTrips(rows, today);
  const featured = pickFeatured(
    ordered,
    typeof wanted === "string" ? wanted : undefined,
  );
  const watched = new Set(passes.map((p) => p.tripId));
  const hero = featured
    ? await heroFor(featured, watched.has(featured.id), today)
    : null;

  const live = ordered.filter((t) => t.state === "live").length;
  const lead = live
    ? `${live === 1 ? "One trip is" : `${live} trips are`} live right now.`
    : rows.length
      ? "Nothing live right now."
      : "Nothing planned yet.";

  return (
    <SiteFrame active="Trips" tab="Trips">
      <PageColumn>
        <HomeHeading lead={lead} />

        {featured && hero ? (
          <>
            <TripSwitcher
              selected={featured.id}
              trips={ordered.map((t) => ({
                id: t.id,
                title: t.title,
                dates: dateRange(t.startsAt, t.endsAt),
                state: t.state,
              }))}
            />
            <TripHero hero={hero} />
            <HomePlan today={planDate} hasTrips />
          </>
        ) : (
          <>
            <Welcome />
            <HomePlan today={planDate} hasTrips={false} />
            <section className="flex flex-col gap-3">
              <SectionRule>An example trip</SectionRule>
              <TripHero
                hero={{
                  trip: georgia,
                  stops: georgiaMapStops,
                  state: "live",
                  decision: {
                    title: "1 change needs your decision",
                    detail: "Rain at 15:30 conflicts with your 16:00 hike",
                    href: `/trips/${georgia.id}/alerts/rain-1530`,
                  },
                  detectors: [
                    { name: "Weather", tone: "alert" },
                    { name: "Roads", tone: "ok" },
                  ],
                  watched: true,
                  applied: 0,
                  example: true,
                }}
              />
            </section>
          </>
        )}

        <div className="flex justify-center pt-2">
          <Link href="/plans" className="text-small font-medium text-agent">
            Planning is free · see what watching costs
          </Link>
        </div>
      </PageColumn>
    </SiteFrame>
  );
}
