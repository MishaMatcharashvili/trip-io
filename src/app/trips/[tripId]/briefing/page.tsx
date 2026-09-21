import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrip } from "@/data/trip";
import { BriefingScreen, type BriefingView } from "@/features/briefing";

export const metadata: Metadata = { title: "Your briefing" };

/**
 * 07:30 Tbilisi. One model call per live trip-day, bundling everything the
 * router sent to the briefing plus the shape of the day ahead — three things
 * to know, and at most one change worth making.
 */
const lines = [
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

export default async function BriefingPage({
  params,
}: PageProps<"/trips/[tripId]/briefing">) {
  const { tripId } = await params;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  const day = trip.days[trip.currentDay - 1];

  const view: BriefingView = {
    tripId: trip.id,
    eyebrow: `Day ${day.index} · ${day.stamp.split(" · ")[1]} · ${day.route.split(" → ").at(-1)}`,
    heading: "Good morning, Misha",
    prose: "Dry until mid-afternoon, roads clear, and one thing worth moving.",
    lines,
    change: {
      sentence:
        "Move the Gergeti hike to 11:30 and the museum to the afternoon. Everything else holds.",
      rows: [{ from: "16:00 HIKE", to: "11:30 HIKE" }],
    },
    dayHref: `/trips/${trip.id}/day/${day.id}`,
    sourceCount: trip.sourceCount,
    watchTone: "ok",
  };

  return <BriefingScreen view={view} />;
}
