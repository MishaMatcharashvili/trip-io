import { SheetBodySkeleton } from "@/features/sheet-skeleton";

export default function Loading() {
  return (
    <div className="flex animate-breathe flex-col" aria-busy="true">
      <span className="sr-only">Loading</span>
      <SheetBodySkeleton />
    </div>
  );
}
