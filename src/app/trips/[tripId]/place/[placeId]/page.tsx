import type { Metadata } from "next";
import { loadPlaceView, PlaceBody, PlaceMapHeader } from "../../place-view";

export const metadata: Metadata = { title: "Checkpoint" };

// A stop as a page of its own: reached by a shared link or a refresh, or from a
// screen outside the trip's own (a briefing). From the map or the plan the same
// stop opens as a popup instead (@modal), and both draw one body.
export default async function PlacePage({
  params,
}: PageProps<"/trips/[tripId]/place/[placeId]">) {
  const { tripId, placeId } = await params;
  const view = await loadPlaceView(tripId, placeId);
  const fixture = view.kind === "fixture";

  return (
    <div className="relative flex min-h-dvh flex-col">
      <PlaceMapHeader view={view} />

      <main
        className={
          fixture
            ? "relative z-10 mt-[194px] flex flex-1 flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet lg:mx-auto lg:mt-[220px] lg:w-[560px] lg:rounded-sheet lg:border"
            : "relative z-10 mt-[224px] flex flex-1 flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet lg:mx-auto lg:mt-[240px] lg:w-[560px] lg:rounded-sheet lg:border"
        }
      >
        <PlaceBody view={view} />
      </main>
    </div>
  );
}
