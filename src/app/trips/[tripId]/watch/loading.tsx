import { PageSkeleton } from "@/features/skeletons";

// The watch settings' column is narrower than the usual page's, and it sits
// under "Trips" in the top bar.
export default function Loading() {
  return <PageSkeleton max="640px" active="Trips" />;
}
