import type { Metadata } from "next";
import { dayKey } from "@/domain/trip/document";
import { AccountButton, Brand, TopBar } from "@/features/chrome";
import { TripComposer } from "@/features/trip-composer";
import { ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { TripMap } from "@/ui/map/trip-map";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Display, Prose } from "@/ui/text";

export const metadata: Metadata = { title: "New trip" };

const examples = [
  "7 days in Georgia, €700, nature and monasteries",
  "Long weekend in Kakheti with my partner",
  "Four days walking in Svaneti, moderate pace",
];

export default function NewTripPage() {
  const today = dayKey(new Date());

  return (
    <>
      {/* The map sits behind the whole screen, washed out — you are choosing a
          place before you have a plan to put on it. */}
      <div className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden opacity-85 lg:block">
        <TripMap
          stops={[]}
          interactive={false}
          className="absolute inset-0 size-full"
        />
        <div className="absolute inset-0 bg-linear-to-b from-canvas/70 to-canvas/95" />
      </div>

      <TopBar active="Trips" transparent watch="none" />

      {/* Desktop — the composer, then what the agent understood. */}
      <main className="hidden flex-1 lg:block">
        <div className="mx-auto flex w-[820px] flex-col items-center gap-[26px] py-12">
          <div className="flex flex-col items-center gap-2.5">
            <Chip>
              <Dot tone="agent" />
              New trip
            </Chip>
            <Display className="text-[38px]">Where do you want to go?</Display>
            <Prose className="max-w-[520px] text-center">
              Describe it the way you would to a friend. I build the itinerary,
              then watch it for you while you travel.
            </Prose>
          </div>

          <TripComposer
            today={today}
            examples={examples}
            placeholder="7 days in Georgia, €700, nature and monasteries, with my father"
          />

          <Card
            tint
            accent="agent"
            className="flex w-full items-center gap-3 px-4 py-3.5"
          >
            <Icon name="signal" size={18} className="text-agent" />
            <p className="flex-1 text-small">
              Once the trip is live I start watching weather, roads, transport
              and local events along your route, and only tell you what actually
              affects your days.
            </p>
            <ButtonLink href="/plans" size="sm">
              What I watch
            </ButtonLink>
          </Card>
        </div>
      </main>

      {/* Mobile — first run. No trips yet, so the screen is only the ask. */}
      <main className="flex flex-1 flex-col px-5 pb-24 lg:hidden">
        <div className="flex items-center gap-2 pt-2.5">
          <Brand size={19} />
          <div className="flex-1" />
          <AccountButton size={28} />
        </div>

        <div className="flex flex-col gap-3 pt-11">
          <Display className="text-[30px]">
            Where do you want
            <br />
            to go?
          </Display>
          <Prose>
            Describe it the way you would to a friend. I build the itinerary,
            then watch it for you while you travel.
          </Prose>
        </div>

        <div className="mt-5">
          <TripComposer
            today={today}
            examples={examples}
            placeholder="A week somewhere with mountains and good food"
          />
        </div>

        <div className="flex-1" />

        <Card tint accent="agent" className="mt-6 flex items-start gap-3 p-3.5">
          <Icon name="signal" size={18} className="text-agent" />
          <p className="flex-1 text-mini">
            Once a trip is live I watch weather, roads, transport and local
            events along it — and only tell you what actually affects your days.
          </p>
        </Card>
      </main>

      <BottomNav items={homeTabs} active="Trips" />
    </>
  );
}
