import type { Metadata } from "next";
import Link from "next/link";
import {
  advisory,
  calmStrip,
  georgia,
  opportunity,
  todayWeather,
} from "@/data/trip";
import { AdvisoryCard, OpportunityCard } from "@/features/advisory";
import { Brand } from "@/features/chrome";
import { CheckpointRow } from "@/features/itinerary";
import { WatchStrip } from "@/features/watch-strip";
import { DayShape, Progress, SkeletonLine, WeatherRibbon } from "@/ui/bars";
import { Button, QuietAction } from "@/ui/button";
import { Card, Divider, EvidenceRow, Panel, SectionRule } from "@/ui/card";
import { Chip, WatchChip } from "@/ui/chip";
import { RadioRow, Toggle } from "@/ui/control";
import { Dot } from "@/ui/dot";
import { Icon, type IconName } from "@/ui/icon";
import { PillNav } from "@/ui/nav";
import { Display, Eyebrow, Headline, Num, Prose, Title } from "@/ui/text";
import { ThemeSegmented } from "@/ui/theme";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false },
};

const palette: Array<{ group: string; swatches: Array<[string, string]> }> = [
  {
    group: "Surfaces",
    swatches: [
      ["canvas", "bg-canvas"],
      ["surface", "bg-surface"],
      ["surface-subtle", "bg-surface-subtle"],
      ["fill", "bg-fill"],
      ["fill-strong", "bg-fill-strong"],
      ["track", "bg-track"],
    ],
  },
  {
    group: "Ink",
    swatches: [
      ["ink", "bg-ink"],
      ["ink-muted", "bg-ink-muted"],
      ["ink-faint", "bg-ink-faint"],
      ["ink-idle", "bg-ink-idle"],
    ],
  },
  {
    group: "The agent",
    swatches: [
      ["agent", "bg-agent"],
      ["agent-hover", "bg-agent-hover"],
      ["agent-soft", "bg-agent-soft"],
      ["agent-line", "bg-agent-line"],
      ["agent-tint", "bg-agent-tint"],
    ],
  },
  {
    group: "A real disruption",
    swatches: [
      ["alert", "bg-alert"],
      ["alert-bright", "bg-alert-bright"],
      ["alert-soft", "bg-alert-soft"],
      ["alert-line", "bg-alert-line"],
      ["alert-tint", "bg-alert-tint"],
    ],
  },
  {
    group: "All clear",
    swatches: [
      ["ok", "bg-ok"],
      ["ok-line", "bg-ok-line"],
      ["ok-tint", "bg-ok-tint"],
    ],
  },
];

const typeRamp: Array<[string, string, string]> = [
  ["Display", "text-display font-semibold tracking-[-0.03em]", "28px"],
  ["Headline", "text-headline font-semibold tracking-[-0.024em]", "19px"],
  ["Title", "text-title font-semibold tracking-[-0.014em]", "14.5px"],
  ["Body", "text-body", "14px"],
  ["Small", "text-small", "12.5px"],
  ["Mini", "text-mini", "11.5px"],
  ["Eyebrow", "text-micro font-semibold uppercase tracking-[0.12em]", "10px"],
];

const iconNames: IconName[] = [
  "signal",
  "signalShort",
  "sparkle",
  "rain",
  "warning",
  "info",
  "check",
  "close",
  "clock",
  "calendar",
  "map",
  "list",
  "route",
  "explore",
  "bookmark",
  "user",
  "mic",
  "filter",
  "photo",
  "offline",
  "revert",
  "locate",
  "plus",
  "minus",
  "arrowRight",
  "chevronRight",
  "chevronLeft",
  "chevronDown",
  "search",
  "sun",
  "moon",
  "display",
];

const screens = [
  ["Trips — home", "/"],
  ["New trip", "/new"],
  ["Building your trip", "/new/building"],
  ["Active trip — map", "/trips/georgia"],
  ["State · nothing to report", "/trips/georgia?state=calm"],
  ["State · change applied", "/trips/georgia?state=applied"],
  ["State · watch layer paused", "/trips/georgia?state=paused"],
  ["The whole trip", "/trips/georgia/trip"],
  ["Day detail", "/trips/georgia/day/3"],
  ["Checkpoint detail", "/trips/georgia/place/3e"],
  ["Replanning", "/trips/georgia/replan"],
  ["Daily briefing", "/trips/georgia/briefing"],
  ["Alert history", "/trips/georgia/alerts"],
  ["Proactive alert", "/trips/georgia/alerts/km84"],
  ["What I watch", "/trips/georgia/watch"],
  ["Push notifications", "/trips/georgia/watch/push"],
  ["Plans & the watch layer", "/plans"],
  ["Explore", "/explore"],
  ["Saved", "/saved"],
];

function Spec({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionRule>{title}</SectionRule>
      {note ? <Prose className="max-w-[640px]">{note}</Prose> : null}
      <Card className="flex flex-wrap items-start gap-5 p-5">{children}</Card>
    </section>
  );
}

export default function DesignSystemPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[58px] shrink-0 items-center gap-5 border-b border-hairline bg-surface px-6">
        <Brand />
        <span className="h-5 w-px bg-hairline" />
        <Title>Design system</Title>
        <div className="flex-1" />
        <Chip>Mist · map-first</Chip>
        <ThemeSegmented />
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-10 px-4 py-10">
        <div className="flex flex-col gap-3">
          <Display>One palette, three jobs</Display>
          <Prose className="max-w-[640px]">
            Periwinkle is the agent — its route, its proposals, its primary
            actions and anything it wants you to look at. Coral is a real
            disruption and nothing else. Green means all clear. Everything else
            is neutral, which is what lets a single coloured dot carry urgency
            without the screen looking alarmed.
          </Prose>
        </div>

        <section className="flex flex-col gap-3">
          <SectionRule>Colour</SectionRule>
          <div className="grid gap-3 lg:grid-cols-5">
            {palette.map((group) => (
              <Card key={group.group} className="flex flex-col gap-2.5 p-4">
                <Eyebrow>{group.group}</Eyebrow>
                {group.swatches.map(([name, cls]) => (
                  <div key={name} className="flex items-center gap-2.5">
                    <span
                      className={`size-6 rounded-md border border-hairline ${cls}`}
                    />
                    <span className="text-mini text-ink-muted">{name}</span>
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionRule>Type</SectionRule>
          <Prose className="max-w-[640px]">
            DM Sans throughout, one size ramp, no serif and no mono. Times,
            distances and money use the same face with tabular figures rather
            than a second family.
          </Prose>
          <Card className="flex flex-col divide-y divide-hairline">
            {typeRamp.map(([name, cls, size]) => (
              <div key={name} className="flex items-baseline gap-5 px-5 py-3.5">
                <Eyebrow className="w-[90px] shrink-0">{name}</Eyebrow>
                <span className={`flex-1 ${cls}`}>
                  Rain starts 15:30 in Kazbegi
                </span>
                <Num className="text-mini text-ink-faint">{size}</Num>
              </div>
            ))}
          </Card>
        </section>

        <Spec
          title="Buttons"
          note="One primary action per surface — it is the agent's own voice, so two of them on a screen means the screen has not decided what it wants."
        >
          <Button variant="primary">Replan my day</Button>
          <Button>View changes</Button>
          <Button variant="ghost">Keep current plan</Button>
          <Button variant="primary" size="lg">
            Apply new route
          </Button>
          <Button size="sm">Add stop</Button>
          <QuietAction>Not interested</QuietAction>
        </Spec>

        <Spec
          title="Status"
          note="The smallest carrier of state in the system."
        >
          <div className="flex items-center gap-3">
            <Dot tone="agent" />
            <Dot tone="alert" />
            <Dot tone="ok" />
            <Dot tone="idle" />
            <Dot tone="ok" breathe />
            <Dot tone="alert" size={9} hollow />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip>Day 3 / 7</Chip>
            <Chip tone="agent">moved −4h 30m</Chip>
            <Chip tone="alert">1 decision</Chip>
            <Chip tone="ok">ENDS 40 MIN EARLIER</Chip>
            <Chip floating>Is the hike still safe today?</Chip>
            <WatchChip state="watching" label="Watching · 12 sources" />
            <WatchChip state="paused" label="Paused" />
          </div>
        </Spec>

        <Spec title="Navigation">
          <PillNav
            items={[
              { label: "Today", href: "/design" },
              { label: "Map", href: "/design" },
              { label: "Trip", href: "/design" },
              { label: "AI", href: "/design" },
            ]}
            active="Map"
          />
        </Spec>

        <Spec title="Controls">
          <div className="flex items-center gap-4">
            <Toggle label="Weather" defaultOn />
            <Toggle label="Safety advisories" />
            <Toggle label="Terrain" size="sm" defaultOn />
          </div>
          <Card className="w-[320px] overflow-hidden">
            <RadioRow
              name="demo"
              value="a"
              label="Only what affects my plan"
              description="The default. Roughly one or two a day."
              defaultChecked
            />
            <Divider />
            <RadioRow
              name="demo"
              value="b"
              label="Anything happening nearby"
              description="More findings, more noise"
            />
          </Card>
        </Spec>

        <Spec
          title="Time, read as shape"
          note="A day you can read without opening it: committed blocks and the gaps between them, and the day's weather as an hourly ribbon so a conflict is visible before it is described."
        >
          <div className="flex w-full flex-col gap-4">
            <DayShape segments={georgia.days[2].shape} className="w-[280px]" />
            <div className="w-[280px]">
              <WeatherRibbon hours={todayWeather} caption="Rain 15:30–19:00" />
            </div>
            <Progress value={0.46} className="w-[280px]" />
            <div className="flex w-[280px] flex-col gap-2">
              <SkeletonLine width="84%" />
              <SkeletonLine width="58%" />
            </div>
          </div>
        </Spec>

        <Spec
          title="Detector ledger"
          note="Zeroes are the point — evidence that silence is a result."
        >
          <WatchStrip detectors={calmStrip} />
        </Spec>

        <Spec
          title="Evidence rows"
          note="Every proactive claim answers the same three questions in the same order, so the card is skimmable before it is read."
        >
          <div className="flex w-full max-w-[520px] flex-col gap-2.5">
            <EvidenceRow label="Changed">{advisory.changed}</EvidenceRow>
            <EvidenceRow label="Affects">{advisory.affects}</EvidenceRow>
            <EvidenceRow label="I suggest">{advisory.suggestion}</EvidenceRow>
          </div>
        </Spec>

        <section className="flex flex-col gap-3">
          <SectionRule>Checkpoints</SectionRule>
          <Panel className="w-[360px] overflow-hidden">
            {georgia.days[2].checkpoints.map((checkpoint) => (
              <CheckpointRow key={checkpoint.id} checkpoint={checkpoint} />
            ))}
          </Panel>
        </section>

        <section className="flex flex-col gap-3">
          <SectionRule>The two card types</SectionRule>
          <Prose className="max-w-[640px]">
            An advisory needs a decision; an opportunity does not. They are
            built to read differently at a glance — coral header and a primary
            action against a neutral header and two secondary ones.
          </Prose>
          <div className="flex flex-wrap gap-4">
            <AdvisoryCard
              advisory={advisory}
              tripId={georgia.id}
              className="w-[376px]"
            />
            <OpportunityCard opportunity={opportunity} className="w-[376px]" />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <SectionRule>Icons</SectionRule>
          <Card className="grid grid-cols-4 gap-y-4 p-5 lg:grid-cols-8">
            {iconNames.map((name) => (
              <div
                key={name}
                className="flex flex-col items-center gap-2 text-ink-muted"
              >
                <Icon name={name} size={20} />
                <span className="text-micro text-ink-faint">{name}</span>
              </div>
            ))}
          </Card>
        </section>

        <section className="flex flex-col gap-3">
          <SectionRule>Every screen</SectionRule>
          <Card className="flex flex-col divide-y divide-hairline">
            {screens.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas"
              >
                <span className="flex-1 text-small font-medium">{label}</span>
                <Num className="text-mini text-ink-faint">{href}</Num>
                <Icon
                  name="chevronRight"
                  size={14}
                  className="text-ink-faint"
                />
              </Link>
            ))}
          </Card>
          <Prose>
            Every screen runs on the fixtures in{" "}
            <span className="font-medium text-ink">src/data/trip.ts</span>,
            whose shapes mirror the Drizzle schema — wiring them to the API is a
            swap of the loader, not a rewrite of the components.
          </Prose>
        </section>

        <Headline as="div" className="pb-10 text-ink-faint">
          <Prose>trip.io · Mist · map-first</Prose>
        </Headline>
      </main>
    </div>
  );
}
