import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { myTrips, type TripListRow, tripScreen } from "@/bll/trip-screen";
import { passesHeldBy } from "@/bll/watch-pass";
import { georgia, georgiaMapStops, type Trip } from "@/data/trip";
import { dayKey } from "@/domain/trip/document";
import { TopBar } from "@/features/chrome";
import { dateRange, tripModel, tripStops } from "@/features/trip-model";
import { getAuth } from "@/infra/auth";
import { ButtonLink } from "@/ui/button";
import { Card, Divider, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { type MapStop, TripMap } from "@/ui/map/trip-map";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Display, Headline, Prose, Title } from "@/ui/text";

export const metadata: Metadata = { title: "Your trips" };

type Live = {
  trip: Trip;
  stops: MapStop[];
  /** The decision waiting on the traveller, when there is one. */
  decision: { title: string; detail: string; href: string } | null;
  detectors: { name: string; tone: "ok" | "alert" | "idle" }[];
  example?: boolean;
};

/** The trip being travelled, with the state of its watch on the card. */
function LiveCard({ live }: { live: Live }) {
  const { trip, decision } = live;
  const today = trip.days[trip.currentDay - 1];

  return (
    <Card
      accent="agent"
      className="flex flex-col overflow-hidden lg:flex-row lg:items-stretch"
    >
      <div className="relative h-[140px] shrink-0 overflow-hidden lg:h-auto lg:min-h-[200px] lg:w-[296px]">
        <TripMap
          stops={live.stops}
          interactive={false}
          fitPadding={24}
          className="absolute inset-0 size-full"
        />
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
            {live.example ? "Example · " : ""}Day {trip.currentDay}/
            {trip.dayCount}
          </Chip>
        </div>

        <div className="flex flex-col overflow-hidden rounded-[9px] border border-hairline lg:flex-row">
          {decision ? (
            <Link
              href={decision.href}
              className="flex flex-1 items-start gap-2 bg-alert-tint px-3.5 py-2.5"
            >
              <Dot tone="alert" className="mt-1.5" />
              <div className="flex-1">
                <div className="text-small font-semibold">{decision.title}</div>
                <div className="text-mini text-ink-muted">
                  {decision.detail}
                </div>
              </div>
            </Link>
          ) : (
            <div className="flex flex-1 items-center gap-2 bg-ok-tint px-3.5 py-2.5">
              <Dot tone="ok" />
              <span className="text-small font-medium">
                Nothing needs your attention
              </span>
            </div>
          )}
          {live.detectors.map((d) => (
            <div
              key={d.name}
              className="hidden items-center gap-2 border-l border-hairline px-3.5 py-2.5 lg:flex"
            >
              <Dot tone={d.tone} />
              <span className="text-small text-ink-muted">{d.name}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <ButtonLink
            href={`/trips/${trip.id}/day/${today?.id ?? "today"}`}
            variant="primary"
            className="flex-1 lg:flex-none"
          >
            Open today
          </ButtonLink>
          <ButtonLink href={`/trips/${trip.id}`}>Map</ButtonLink>
          <ButtonLink href={`/trips/${trip.id}/trip`}>Trip</ButtonLink>
          <div className="hidden flex-1 lg:block" />
          <span className="hidden text-mini text-ink-faint lg:inline">
            {trip.lastCheck === "not yet"
              ? "Not checked yet"
              : `Last checked ${trip.lastCheck}`}{" "}
            · {trip.sourceCount} sources
          </span>
        </div>
      </div>
    </Card>
  );
}

function TripRow({
  row,
  note,
  action,
}: {
  row: TripListRow;
  note: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3 lg:gap-[18px] lg:px-5 lg:py-3.5">
      <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] border border-hairline bg-canvas text-ink-faint">
        <Icon name="route" size={18} />
      </span>
      <Link
        href={`/trips/${row.id}/trip`}
        className="flex flex-1 flex-col gap-0.5 hover:text-agent"
      >
        <Title className="text-small lg:text-title">{row.title}</Title>
        <span className="text-mini text-ink-faint">
          {dateRange(row.startsAt, row.endsAt)} · {note}
        </span>
      </Link>
      {action}
      <Icon name="chevronRight" size={15} className="text-ink-faint" />
    </div>
  );
}

async function liveFor(row: TripListRow): Promise<Live | null> {
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
    decision: open
      ? {
          title: "1 change needs your decision",
          detail: open.title,
          href: `/trips/${row.id}/alerts/${open.id}`,
        }
      : null,
    detectors: [family("weather", "Weather"), family("road", "Roads")],
  };
}

/** Signed out, or nothing planned yet: the way in, and what it looks like. */
function Welcome({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <Card className="flex flex-col gap-3 p-5 lg:p-7">
        <Headline className="text-[20px] lg:text-[24px]">
          Plan a trip through Georgia, and I will watch it for you
        </Headline>
        <Prose>
          Tell me where and when. I build the days from places I have checked,
          then watch the weather and roads around every stop and tell you only
          when something should change.
        </Prose>
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink href="/new" variant="primary">
            Plan a trip
          </ButtonLink>
          {signedIn ? null : (
            <ButtonLink href="/sign-in">I have an account</ButtonLink>
          )}
        </div>
      </Card>
      <section className="flex flex-col gap-3">
        <SectionRule>An example trip</SectionRule>
        <LiveCard
          live={{
            trip: georgia,
            stops: georgiaMapStops,
            decision: {
              title: "1 change needs your decision",
              detail: "Rain at 15:30 conflicts with your 16:00 hike",
              href: `/trips/${georgia.id}/alerts/rain-1530`,
            },
            detectors: [
              { name: "Weather", tone: "alert" },
              { name: "Roads", tone: "ok" },
            ],
            example: true,
          }}
        />
      </section>
    </>
  );
}

export default async function TripsHome() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const rows = session ? await myTrips(session.user.id) : [];
  const passes = session ? await passesHeldBy(session.user.id) : [];
  const watched = new Set(passes.map((p) => p.tripId));

  const today = dayKey(new Date());
  const live = rows.filter(
    (r) => dayKey(r.startsAt) <= today && dayKey(r.endsAt) >= today,
  );
  const upcoming = rows.filter((r) => dayKey(r.startsAt) > today);
  const finished = rows.filter((r) => dayKey(r.endsAt) < today).reverse();
  const lives = (await Promise.all(live.map(liveFor))).filter(
    (l): l is Live => l !== null,
  );

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
                {lives.length
                  ? `${lives.length === 1 ? "One trip is" : `${lives.length} trips are`} live right now.`
                  : rows.length
                    ? "Nothing live right now."
                    : "Nothing planned yet."}
              </Prose>
            </div>
            <ButtonLink href="/new" variant="primary" className="px-[18px]">
              <span className="hidden lg:inline">New trip</span>
              <span className="lg:hidden">New</span>
            </ButtonLink>
          </div>

          {rows.length === 0 ? <Welcome signedIn={Boolean(session)} /> : null}

          {lives.length ? (
            <section className="flex flex-col gap-3">
              <SectionRule tone="agent">Travelling now</SectionRule>
              {lives.map((l) => (
                <LiveCard key={l.trip.id} live={l} />
              ))}
            </section>
          ) : null}

          {upcoming.length ? (
            <section className="flex flex-col gap-3">
              <SectionRule>Coming up</SectionRule>
              <Card className="overflow-hidden">
                {upcoming.map((row, i) => (
                  <div key={row.id}>
                    {i > 0 ? <Divider /> : null}
                    <TripRow
                      row={row}
                      note={`${row.stops} stops · ${watched.has(row.id) ? "watch starts a day before you leave" : "not watched yet"}`}
                      action={
                        watched.has(row.id) ? null : (
                          <ButtonLink
                            href={`/trips/${row.id}/watch`}
                            size="sm"
                            className="hidden lg:inline-flex"
                          >
                            Start watching
                          </ButtonLink>
                        )
                      }
                    />
                  </div>
                ))}
              </Card>
            </section>
          ) : null}

          {finished.length ? (
            <section className="flex flex-col gap-3">
              <SectionRule>Finished</SectionRule>
              <Card className="overflow-hidden">
                {finished.map((row, i) => (
                  <div key={row.id}>
                    {i > 0 ? <Divider /> : null}
                    <TripRow
                      row={row}
                      note={`${row.applied} change${row.applied === 1 ? "" : "s"} handled`}
                    />
                  </div>
                ))}
              </Card>
            </section>
          ) : null}

          <div className="flex justify-center pt-2">
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
