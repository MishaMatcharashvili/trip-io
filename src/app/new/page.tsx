import type { Metadata } from "next";
import Link from "next/link";
import { Brand, TopBar } from "@/features/chrome";
import { ButtonLink } from "@/ui/button";
import { Card, Divider } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BasemapWeather } from "@/ui/map/basemap-weather";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Display, Eyebrow, Prose } from "@/ui/text";

export const metadata: Metadata = { title: "New trip" };

const understood = [
  { label: "Region", value: "Georgia", note: "Kazbegi · Kakheti · Tbilisi" },
  { label: "Length", value: "7 days", note: "Dates not set yet" },
  { label: "Budget", value: "€700", note: "Excl. flights" },
  { label: "Interests", value: "Nature, monasteries", note: "Moderate hiking" },
  { label: "Travellers", value: "You + father", note: "Relaxed pace assumed" },
];

const examples = [
  "7 days in Georgia, €700, nature and monasteries",
  "Long weekend in Kakheti with my partner",
  "Four days walking in Svaneti, moderate pace",
];

/** The blinking caret that makes the prompt read as something being typed. */
function Caret({ height = 20 }: { height?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ height }}
      className="ml-0.5 inline-block w-[1.5px] animate-breathe bg-agent align-[-3px]"
    />
  );
}

export default function NewTripPage() {
  return (
    <>
      {/* The map sits behind the whole screen, washed out — you are choosing a
          place before you have a plan to put on it. */}
      <div className="pointer-events-none fixed inset-0 -z-10 hidden overflow-hidden opacity-85 lg:block">
        <BasemapWeather className="absolute inset-0 size-full" />
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

          <Card className="flex w-full flex-col gap-4 rounded-[16px] p-5 pb-4 shadow-lifted">
            <p className="text-headline leading-[1.5] tracking-[-0.01em]">
              7 days in Georgia, €700 budget, nature + monasteries, traveling
              with my father.
              <Caret />
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                "+ Add dates",
                "+ Arriving by",
                "+ Pace",
                "+ Mobility needs",
              ].map((chip) => (
                <Chip key={chip}>{chip}</Chip>
              ))}
            </div>
            <Divider />
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-mini text-ink-faint">
                <Icon name="mic" size={15} />
                Or say it out loud
              </span>
              <div className="flex-1" />
              <ButtonLink href="/new" variant="ghost">
                Start from a saved route
              </ButtonLink>
              <ButtonLink
                href="/new/building"
                variant="primary"
                className="px-5"
              >
                Plan my trip
              </ButtonLink>
            </div>
          </Card>

          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <Icon name="sparkle" size={15} className="text-agent" />
              <span className="text-small font-medium">
                Here is what I understood — correct anything before I build it
              </span>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {understood.map((item) => (
                <Card
                  key={item.label}
                  className="flex flex-col gap-1.5 px-3.5 py-3"
                >
                  <Eyebrow>{item.label}</Eyebrow>
                  <span className="text-small font-medium">{item.value}</span>
                  <span className="text-mini text-ink-faint">{item.note}</span>
                </Card>
              ))}
            </div>
          </div>

          <Card
            accent="agent"
            className="flex w-full items-center gap-3 bg-agent-tint px-4 py-3.5"
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
          <span className="size-7 rounded-full border border-control bg-fill" />
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

        <Card className="mt-5 flex flex-col gap-3 p-3.5">
          <p className="text-[15px] leading-[1.5] text-ink-faint">
            A week somewhere with mountains and good food, not too expensive
            <Caret height={17} />
          </p>
          <Divider />
          <div className="flex items-center gap-2.5">
            <Icon name="mic" size={16} className="text-ink-faint" />
            <span className="flex-1 text-mini text-ink-faint">
              Or say it out loud
            </span>
            <ButtonLink href="/new/building" variant="primary">
              Start
            </ButtonLink>
          </div>
        </Card>

        <div className="flex flex-col gap-2.5 pt-5">
          <Eyebrow>Or try one of these</Eyebrow>
          {examples.map((example) => (
            <Link key={example} href="/new/building">
              <Card className="flex items-center gap-2.5 px-3.5 py-3">
                <span className="flex-1 text-small">{example}</span>
                <Icon
                  name="chevronRight"
                  size={14}
                  className="text-ink-faint"
                />
              </Card>
            </Link>
          ))}
        </div>

        <div className="flex-1" />

        <Card
          accent="agent"
          className="mt-6 flex items-start gap-3 bg-agent-tint p-3.5"
        >
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
