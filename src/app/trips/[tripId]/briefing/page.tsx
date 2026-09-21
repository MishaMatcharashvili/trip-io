import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { briefingPage } from "@/bll/briefing.ts";
import { accessTrip } from "@/bll/trip-document.ts";
import { getTrip } from "@/data/trip";
import { BriefingScreen } from "@/features/briefing";
import { BriefingOpened } from "@/features/briefing-opened";
import { getAuth } from "@/infra/auth.ts";
import type { Tone } from "@/ui/cx";

export const metadata: Metadata = { title: "Your briefing" };

/**
 * 07:30 Tbilisi. One model call per live trip-day, bundling everything the
 * router sent to the briefing plus the shape of the day ahead.
 *
 * This is the first screen in the app to read the database rather than the
 * fixtures — the briefing ships before interrupts do, so it is the first thing
 * a traveller ever receives. The fixture trip is still served from
 * `src/data/trip.ts` so that `/design` keeps its reference render; its id is a
 * slug and every real one is a UUID, so the two can never collide.
 */

const fixtureLines = [
  {
    key: "weather",
    tone: "alert" as const,
    kind: "Weather",
    title: "Clear now, rain from 16:00",
    detail: "12 mm, easing by 19:00 · 8°C on the ridge",
  },
  {
    key: "transport",
    tone: "ok" as const,
    kind: "Transport",
    title: "No transport issues on your route",
    detail: "Military Highway open · marshrutka running normally",
  },
  {
    key: "local",
    tone: "agent" as const,
    kind: "Local",
    title: "Sheep migration festival in Sno, 18:00",
    detail: "6 min from your dinner · free entry",
  },
];

const longDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const dateLabel = (date: string) =>
  longDate.format(new Date(`${date}T09:00:00+04:00`)).toUpperCase();

export default async function BriefingPage({
  params,
}: PageProps<"/trips/[tripId]/briefing">) {
  const { tripId } = await params;

  const fixture = getTrip(tripId);
  if (fixture) {
    const day = fixture.days[fixture.currentDay - 1];
    return (
      <BriefingScreen
        view={{
          tripId: fixture.id,
          eyebrow: `Day ${day.index} · ${day.stamp.split(" · ")[1]} · ${day.route.split(" → ").at(-1)}`,
          heading: "Good morning, Misha",
          prose:
            "Dry until mid-afternoon, roads clear, and one thing worth moving.",
          lines: fixtureLines,
          change: {
            sentence:
              "Move the Gergeti hike to 11:30 and the museum to the afternoon. Everything else holds.",
            rows: [{ from: "16:00 HIKE", to: "11:30 HIKE" }],
          },
          dayHref: `/trips/${fixture.id}/day/${day.id}`,
          sourceCount: fixture.sourceCount,
          watchTone: "ok",
        }}
      />
    );
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) notFound();

  const access = await accessTrip(tripId, session.user.id);
  if (!access.ok) notFound();

  const page = await briefingPage(tripId);

  // A trip saved after this morning's run has no briefing yet. Saying so is
  // better than a 404 on a page the traveller was told to expect.
  if (!page) {
    return (
      <BriefingScreen
        view={{
          tripId,
          eyebrow: "Watching",
          heading: "Good morning",
          prose: "Your first briefing arrives at 07:30, Tbilisi time.",
          lines: [
            {
              key: "pending",
              tone: "ok",
              kind: "All clear",
              title: "Nothing to report yet",
              detail: "The watch is on. Nothing has changed on your route.",
            },
          ],
          change: null,
          dayHref: `/trips/${tripId}`,
          sourceCount: 1,
          watchTone: "ok",
        }}
      />
    );
  }

  const { briefing, change } = page;
  const doc = briefing.document;
  const watchTone: Tone = doc.lines.some((l) => l.tone === "alert")
    ? "alert"
    : "ok";

  return (
    <>
      <BriefingOpened id={briefing.id} />
      <BriefingScreen
        view={{
          tripId,
          eyebrow: `Day ${doc.day.index} · ${dateLabel(doc.day.date)}`,
          heading: "Good morning",
          prose: doc.greeting,
          lines: doc.lines.map((line, i) => ({
            key: line.matchIds.join("-") || `line-${i}`,
            tone: line.tone as Tone,
            kind: line.kind,
            title: line.title,
            detail: line.detail,
            evidence: line.evidence,
          })),
          change,
          dayHref: `/trips/${tripId}`,
          sourceCount: doc.sources,
          watchTone,
        }}
      />
    </>
  );
}
