import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  type Constraints,
  constraints as constraintsSchema,
} from "@/domain/trip/generate/constraints";
import { BuildRunner, type BuildStep } from "@/features/build-runner";
import { Brand } from "@/features/chrome";
import { SkeletonLine } from "@/ui/bars";
import { ButtonLink } from "@/ui/button";
import { Card, Panel, SectionRule } from "@/ui/card";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BasemapCalm } from "@/ui/map/basemap-calm";
import { TripMap } from "@/ui/map/trip-map";
import { Display, Eyebrow, Num, Prose, Title } from "@/ui/text";

export const metadata: Metadata = { title: "Building your trip" };

/**
 * Composition takes about a minute. Rather than spin, the screen names what it
 * is doing and lands days as they finish — progress you can read.
 */
const steps = [
  {
    state: "done" as const,
    title: "Shaped seven days around Kazbegi and Kakheti",
    note: "Driving days kept under 2 hours",
  },
  {
    state: "done" as const,
    title: "Picked 31 places against your €700 budget",
    note: "Tracking at €640 including food",
  },
  {
    state: "running" as const,
    title: "Checking opening hours and seasonal closures",
    note: "19 of 31 verified",
  },
  {
    state: "waiting" as const,
    title: "Setting up the watch layer for your route",
    note: "Weather, roads, transport, events",
  },
];

const landed = [
  {
    day: "Day 1 · Tue",
    place: "Tbilisi",
    nodes: [
      { time: "14:00", title: "Arrive, old town walk" },
      { time: "18:30", title: "Sulphur baths" },
    ],
  },
  {
    day: "Day 2 · Wed",
    place: "Mtskheta",
    nodes: [
      { time: "09:30", title: "Jvari Monastery" },
      { time: "15:00", title: "Drive to Gudauri" },
    ],
  },
];

/** The canvas's reference render, for /design and a bare /new/building. */
function ReferenceBuilding() {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80">
        <BasemapCalm className="absolute inset-0 size-full" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-canvas/70" />

      <header className="relative z-10 flex h-[58px] shrink-0 items-center gap-2.5 px-6">
        <Brand />
        <div className="flex-1" />
        <ButtonLink href="/new" variant="ghost">
          Cancel
        </ButtonLink>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-col items-start gap-7 px-4 py-8 lg:flex-row lg:py-12">
        <Panel className="w-full shrink-0 overflow-hidden lg:w-[520px]">
          <div className="flex flex-col gap-2.5 px-6 pb-[18px] pt-6">
            <div className="flex items-center gap-2.5">
              <Icon name="sparkle" size={16} className="text-agent" />
              <Eyebrow tone="agent">Building your trip</Eyebrow>
            </div>
            <Display className="text-[26px] lg:text-[29px]">
              Seven days in Georgia,
              <br />
              nature and monasteries
            </Display>
            <Prose>
              This takes about a minute. You can leave the page — I will finish
              and email you.
            </Prose>
          </div>

          <div className="mx-6 h-[3px] overflow-hidden rounded-sm bg-track">
            <div className="h-full w-[62%] rounded-sm bg-agent" />
          </div>

          <div className="flex flex-col px-6 pb-5 pt-4">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className={`flex items-center gap-3 py-2.5 ${i > 0 ? "border-t border-track" : ""} ${
                  step.state === "waiting" ? "opacity-50" : ""
                }`}
              >
                {step.state === "done" ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ok-tint text-ok">
                    <Icon name="check" size={11} strokeWidth={2.6} />
                  </span>
                ) : step.state === "running" ? (
                  <span className="size-5 shrink-0 animate-breathe rounded-full border-2 border-agent border-t-transparent" />
                ) : (
                  <span className="size-5 shrink-0 rounded-full border-[1.5px] border-control" />
                )}
                <div className="flex-1">
                  <div
                    className={`text-small ${step.state === "running" ? "font-semibold" : "font-medium"}`}
                  >
                    {step.title}
                  </div>
                  <div
                    className={`text-mini ${step.state === "running" ? "text-agent" : "text-ink-faint"}`}
                  >
                    {step.note}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <div className="flex w-full flex-1 flex-col gap-3">
          <SectionRule>Days as they land</SectionRule>

          {landed.map((day) => (
            <Card key={day.day} className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex items-center gap-2.5">
                <Eyebrow>{day.day}</Eyebrow>
                <Title className="flex-1">{day.place}</Title>
              </div>
              <div className="flex flex-col gap-1.5">
                {day.nodes.map((node) => (
                  <div key={node.time} className="flex items-center gap-2.5">
                    <Num className="w-[38px] text-mini text-ink-faint">
                      {node.time}
                    </Num>
                    <span className="flex-1 text-small">{node.title}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          <Card accent="agent" className="flex flex-col gap-2 px-3.5 py-3">
            <div className="flex items-center gap-2.5">
              <Eyebrow tone="agent">Day 3 · Thu</Eyebrow>
              <Title className="flex-1">Kazbegi</Title>
              <Dot tone="agent" breathe />
            </div>
            <div className="flex flex-col gap-[7px]">
              <div className="flex items-center gap-2.5">
                <Num className="w-[38px] text-mini text-ink-faint">10:15</Num>
                <span className="flex-1 text-small">Friendship Monument</span>
              </div>
              <SkeletonLine width="72%" />
            </div>
          </Card>

          {[
            { day: "Day 4 · Fri", widths: ["84%", "58%"] },
            { day: "Day 5 · Sat", widths: ["66%", "78%"] },
          ].map((placeholder) => (
            <Card
              tint
              key={placeholder.day}
              className="flex flex-col gap-2.5 px-3.5 py-3"
            >
              <Eyebrow>{placeholder.day}</Eyebrow>
              {placeholder.widths.map((width) => (
                <SkeletonLine key={width} width={width} />
              ))}
            </Card>
          ))}

          <div className="pt-1">
            <ButtonLink href="/trips/georgia" variant="primary">
              Skip ahead to the finished trip
            </ButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}

const areaNames: Record<string, string> = {
  "tbilisi-core": "Tbilisi",
  "kazbegi-corridor": "Kazbegi",
  kakheti: "Kakheti",
  svaneti: "Svaneti",
};

const WORDS = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];

/** The constraints /new sent, or null when the token is not one. */
function decode(token: string | string[] | undefined): Constraints | null {
  if (typeof token !== "string") return null;
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const parsed = constraintsSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const dayLabel = (start: string, i: number) => {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
};

export default async function BuildingPage({
  searchParams,
}: PageProps<"/new/building">) {
  const { c } = await searchParams;
  if (c === undefined) return <ReferenceBuilding />;
  const wanted = decode(c);
  if (!wanted) redirect("/new");

  const areas = wanted.areas.map((a) => areaNames[a]).join(" and ");
  const people = wanted.party.adults + wanted.party.children;
  const steps: BuildStep[] = [
    {
      title: `Shaping ${wanted.days} days around ${areas}`,
      note: `${wanted.pace[0].toUpperCase()}${wanted.pace.slice(1)} pace, driving days kept short`,
    },
    {
      title: `Choosing places for ${people} ${people === 1 ? "person" : "people"}`,
      note: wanted.interests.length
        ? `Leaning towards ${wanted.interests.join(", ")}`
        : "A bit of everything",
    },
    {
      title: "Fitting them around opening hours and daylight",
      note: "Every day is checked before you see it",
    },
    {
      title: "Writing it into your plan",
      note: "Then the watch can start on it",
    },
  ];

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80">
        <TripMap
          stops={[]}
          interactive={false}
          className="absolute inset-0 size-full"
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-canvas/70" />

      <header className="relative z-10 flex h-[58px] shrink-0 items-center gap-2.5 px-6">
        <Brand />
        <div className="flex-1" />
        <ButtonLink href="/new" variant="ghost">
          Cancel
        </ButtonLink>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1100px] flex-col items-start gap-7 px-4 py-8 lg:flex-row lg:py-12">
        <Panel className="w-full shrink-0 overflow-hidden lg:w-[520px]">
          <div className="flex flex-col gap-2.5 px-6 pb-[18px] pt-6">
            <div className="flex items-center gap-2.5">
              <Icon name="sparkle" size={16} className="text-agent" />
              <Eyebrow tone="agent">Building your trip</Eyebrow>
            </div>
            <Display className="text-[26px] lg:text-[29px]">
              {WORDS[wanted.days] ?? wanted.days} days in Georgia,
              <br />
              {areas}
            </Display>
            <Prose>
              This takes up to a minute. Stay on this page — the trip opens as
              soon as it is ready.
            </Prose>
          </div>
          <BuildRunner constraints={wanted} steps={steps} />
        </Panel>

        <div className="flex w-full flex-1 flex-col gap-3">
          <SectionRule>Your days</SectionRule>
          {Array.from({ length: Math.min(wanted.days, 7) }, (_, i) => (
            <Card
              tint
              // biome-ignore lint/suspicious/noArrayIndexKey: days are positional
              key={i}
              className="flex flex-col gap-2.5 px-3.5 py-3"
            >
              <Eyebrow>
                Day {i + 1} · {dayLabel(wanted.startDate, i)}
              </Eyebrow>
              <SkeletonLine width={`${60 + ((i * 17) % 30)}%`} />
              <SkeletonLine width={`${50 + ((i * 23) % 35)}%`} />
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
