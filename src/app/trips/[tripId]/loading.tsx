import { TripMapSkeleton } from "@/features/skeletons";

// The trip's own screen is its map. The pages under it are lists and carry
// their own loading.tsx, so they do not flash a map on the way in.
export default function Loading() {
  return <TripMapSkeleton />;
}
