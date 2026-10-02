import { DayAccordionSkeleton } from "@/features/day-accordion";
import { Button } from "@/ui/button";
import { figures, STAT_LABELS, TOTAL_LABELS, WholeTripShell } from "./shell";

const value = (width: string) => (
  <span className={`inline-block h-[14px] ${width} rounded-[3px] bg-track`} />
);

// The plan's own frame, with a grey bar for each figure and each day. The page
// and this are one component (shell.tsx), so they cannot differ in layout.
export default function Loading() {
  return (
    <WholeTripShell
      eyebrow={
        <span className="inline-block h-[9px] w-[230px] animate-breathe rounded-[3px] bg-track" />
      }
      stats={figures(STAT_LABELS, [
        value("w-[44px]"),
        value("w-[22px]"),
        value("w-[22px]"),
      ])}
      totals={figures(TOTAL_LABELS, [
        value("w-[70px]"),
        value("w-[96px]"),
        value("w-[22px]"),
        value("w-[56px]"),
      ])}
      map={<div className="absolute inset-0 bg-map-ground" />}
      days={<DayAccordionSkeleton />}
      actions={
        <>
          <Button disabled>Add a day</Button>
          <Button disabled>Change history</Button>
        </>
      }
    />
  );
}
