import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrip } from "@/data/trip";
import { TopBar } from "@/features/chrome";
import { BasemapDetailed } from "@/ui/map/basemap-detailed";
import { BasemapMobileRoute } from "@/ui/map/basemap-mobile-route";
import { BottomNav, tripTabs } from "@/ui/nav";
import { ActiveTripDesktop } from "./desktop";
import { ActiveTripMobile } from "./mobile";
import { parseState } from "./state";

export const metadata: Metadata = { title: "Map" };

export default async function ActiveTripPage({
  params,
  searchParams,
}: PageProps<"/trips/[tripId]">) {
  const { tripId } = await params;
  const { state: rawState } = await searchParams;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  const state = parseState(rawState);
  // The calm state is a different day on purpose: day 5 is what most days look
  // like, and the screen has to look deliberate rather than empty.
  const day = trip.days[state === "calm" ? 4 : 2];

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        trip={trip}
        tabs={tripTabs(trip.id)}
        active="Map"
        watch={state === "paused" ? "paused" : "watching"}
      />

      {/* The map is the canvas; everything else floats over it. */}
      <div className="relative flex-1 overflow-hidden">
        <BasemapDetailed className="absolute inset-0 hidden size-full lg:block" />
        <BasemapMobileRoute className="absolute inset-0 size-full lg:hidden" />
        {state === "paused" ? (
          <div className="absolute inset-0 bg-canvas/40" aria-hidden="true" />
        ) : null}

        <ActiveTripDesktop trip={trip} day={day} state={state} />
        <ActiveTripMobile trip={trip} day={day} state={state} />
      </div>

      <BottomNav items={tripTabs(trip.id)} active="Map" />
    </div>
  );
}
