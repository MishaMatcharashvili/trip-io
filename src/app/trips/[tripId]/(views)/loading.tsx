import { MapSkeleton } from "./map-skeleton";

// The map is the trip's own screen, so this is its loading state. The pages
// beside it carry their own, and the bars above and below are the layout's.
export default function Loading() {
  return <MapSkeleton />;
}
