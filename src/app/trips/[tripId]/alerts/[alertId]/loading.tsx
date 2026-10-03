import { SheetScreenSkeleton } from "@/features/sheet-skeleton";

// The same map height and sheet offset as the alert card itself. Without its
// own, this screen borrowed the generic page skeleton, which has nothing in
// common with a sheet over a map.
export default function Loading() {
  return (
    <SheetScreenSkeleton
      mapHeight="h-[420px]"
      sheetTop="mt-[354px] lg:mt-[300px]"
    />
  );
}
