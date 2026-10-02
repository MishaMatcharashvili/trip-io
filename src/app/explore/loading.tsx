import { ExploreSkeleton } from "@/features/explore-skeleton";
import { SiteFrame } from "@/features/site-frame";

// The same frame and the same shell the screen draws before its map: with
// nothing known yet, the regions and the aside are bars.
export default function Loading() {
  return (
    <SiteFrame active="Explore" tab="Explore">
      <ExploreSkeleton />
    </SiteFrame>
  );
}
