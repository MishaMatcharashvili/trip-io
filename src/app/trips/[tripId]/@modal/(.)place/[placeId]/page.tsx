import {
  loadPlaceView,
  PlaceBody,
  PlaceSave,
} from "@/app/trips/[tripId]/place-view";

// The stop, opened as a popup over the screen the traveller was on. This
// intercepts /trips/:id/place/:stop for a navigation from inside the trip's own
// screens; opened any other way — a shared link, a refresh, from a briefing —
// the page at that address is shown instead. Same view, same body.
export default async function PlaceModalPage({
  params,
}: PageProps<"/trips/[tripId]/place/[placeId]">) {
  const { tripId, placeId } = await params;
  const view = await loadPlaceView(tripId, placeId);

  return (
    <PlaceBody
      view={view}
      toolbar={
        <PlaceSave
          view={view}
          className="size-[38px] shrink-0 rounded-[10px] border border-hairline-strong bg-surface"
        />
      }
    />
  );
}
