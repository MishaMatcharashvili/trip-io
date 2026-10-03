import { SheetScreenSkeleton } from "@/features/sheet-skeleton";

// The same map height and sheet offset as the briefing itself.
export default function Loading() {
  return (
    <SheetScreenSkeleton
      mapHeight="h-[270px]"
      sheetTop="mt-[214px] lg:mt-[240px]"
    />
  );
}
