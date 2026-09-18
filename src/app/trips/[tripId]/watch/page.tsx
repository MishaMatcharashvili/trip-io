import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTrip } from "@/data/trip";
import { MobileTitleBar, TopBar } from "@/features/chrome";
import { Card, Divider, SectionRule } from "@/ui/card";
import { WatchChip } from "@/ui/chip";
import { RadioRow, Toggle } from "@/ui/control";
import { Icon } from "@/ui/icon";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Display, Eyebrow, Num } from "@/ui/text";

export const metadata: Metadata = { title: "What I watch" };

/**
 * Signal-over-noise as a user control. Each source says what it would actually
 * interrupt you for, so turning one off is an informed choice rather than a
 * shot in the dark.
 */
const sources = [
  {
    name: "Weather",
    note: "Forecast shifts that hit an outdoor plan",
    on: true,
  },
  {
    name: "Roads and closures",
    note: "Only on roads you will actually drive",
    on: true,
  },
  {
    name: "Transport",
    note: "Marshrutkas, trains, strikes, local events",
    on: true,
  },
  {
    name: "Opening hours",
    note: "Re-checked the day before you arrive",
    on: true,
  },
  {
    name: "Safety advisories",
    note: "Off — you turned these off on 15 Sep",
    on: false,
  },
];

export default async function WatchSettingsPage({
  params,
}: PageProps<"/trips/[tripId]/watch">) {
  const { tripId } = await params;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar active="Trips" />

      <MobileTitleBar
        back={`/trips/${trip.id}`}
        title="What I watch"
        eyebrow={`${trip.title.split(" · ")[0]} · ${trip.dates}`}
        trailing={
          <WatchChip
            state="watching"
            label="On"
            className="h-[26px] text-mini"
          />
        }
      />

      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-3.5 px-4 pb-28 pt-3 lg:pb-12 lg:pt-8">
        <div className="hidden items-start gap-4 lg:flex">
          <div className="flex flex-1 flex-col gap-1.5">
            <Eyebrow>
              {trip.title.split(" · ")[0]} · {trip.dates}
            </Eyebrow>
            <Display className="text-[26px]">What I watch</Display>
          </div>
          <WatchChip
            state="watching"
            label={`On · ${trip.sourceCount} sources`}
          />
        </div>

        <section className="flex flex-col gap-2.5">
          <SectionRule>Sources</SectionRule>
          <Card className="overflow-hidden">
            {sources.map((source, i) => (
              <div key={source.name}>
                {i > 0 ? <Divider /> : null}
                <div className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="flex-1">
                    <div
                      className={`text-small font-medium ${source.on ? "" : "text-ink-muted"}`}
                    >
                      {source.name}
                    </div>
                    <div className="text-mini text-ink-faint">
                      {source.note}
                    </div>
                  </div>
                  <Toggle label={source.name} defaultOn={source.on} />
                </div>
              </div>
            ))}
          </Card>
        </section>

        <section className="flex flex-col gap-2.5">
          <SectionRule>How much to tell you</SectionRule>
          <Card className="overflow-hidden">
            <RadioRow
              name="verbosity"
              value="affecting"
              label="Only what affects my plan"
              description="The default. Roughly one or two a day."
              defaultChecked
            />
            <Divider />
            <RadioRow
              name="verbosity"
              value="nearby"
              label="Anything happening nearby"
              description="More findings, more noise"
            />
          </Card>
        </section>

        <section className="flex flex-col gap-2.5">
          <SectionRule>When and how</SectionRule>
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex-1 text-small font-medium">
                Push notifications
              </span>
              <Toggle label="Push notifications" defaultOn />
            </div>
            <Divider />
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex-1 text-small font-medium">Email</span>
              <Toggle label="Email" />
            </div>
            <Divider />
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex-1 text-small font-medium">
                Morning briefing at
              </span>
              <Num className="text-small font-semibold">07:30</Num>
              <Icon name="chevronRight" size={14} className="text-ink-faint" />
            </div>
            <Divider />
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="flex-1">
                <div className="text-small font-medium">Quiet hours</div>
                <div className="text-mini text-ink-faint">
                  Urgent disruptions still come through
                </div>
              </div>
              <Num className="text-small font-semibold">22:00 – 07:00</Num>
            </div>
          </Card>
        </section>

        <Link
          href={`/trips/${trip.id}/watch/push`}
          className="flex items-center gap-2.5 rounded-card border border-hairline bg-surface px-3.5 py-3 transition-colors hover:bg-canvas"
        >
          <Icon name="signal" size={18} className="text-agent" />
          <span className="flex-1 text-small font-medium">
            How an alert reaches you
          </span>
          <Icon name="chevronRight" size={14} className="text-ink-faint" />
        </Link>
      </main>

      <BottomNav items={homeTabs} active="Profile" />
    </div>
  );
}
