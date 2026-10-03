import { SheetScreenSkeleton } from "@/features/sheet-skeleton";

// The same map height and sheet offset as the place screen itself.
export default function Loading() {
  return (
    <SheetScreenSkeleton
      mapHeight="h-[260px]"
      sheetTop="mt-[224px] lg:mt-[240px]"
    />
  );
}
