import { Divider } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";

// The loading state of the screens that are a sheet over a map — a place, a
// briefing, an alert. They share one shape (a washed map across the top, a back
// button floating on it, a rounded sheet rising from below on a phone and
// centred on a wide screen) and differ only in how tall the map is and how far
// down the sheet starts, which each passes as its own page does.

const bar = (className: string) => (
  <div className={cx("rounded-[3px] bg-track", className)} />
);

/** What is inside a sheet: a heading, four figures and two sections of grey. */
export function SheetBodySkeleton() {
  return (
    <>
      <div className="flex flex-col gap-2.5 px-[18px] pb-3.5 pt-[18px]">
        {bar("h-[9px] w-[130px]")}
        {bar("h-[26px] w-[62%]")}
        {bar("h-[10px] w-[85%]")}
      </div>
      <div className="flex border-b border-hairline px-[18px] pb-3.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-1 flex-col gap-1.5">
            {bar("h-[8px] w-[48px]")}
            {bar("h-[12px] w-[44px]")}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 px-[18px] py-3.5">
        {bar("h-[9px] w-[160px]")}
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="size-[9px] rounded-full bg-track" />
            {bar("h-[10px] flex-1")}
            {bar("h-[9px] w-[64px]")}
          </div>
        ))}
      </div>
      <Divider />
      <div className="flex flex-col gap-2.5 px-[18px] py-3.5">
        {bar("h-[9px] w-[130px]")}
        {bar("h-[10px] w-[90%]")}
        {bar("h-[10px] w-[70%]")}
      </div>
    </>
  );
}

export function SheetScreenSkeleton({
  mapHeight,
  sheetTop,
}: {
  /** Tailwind height of the map behind: "h-[260px]". */
  mapHeight: string;
  /** The sheet's offset, phone and wide: "mt-[224px] lg:mt-[240px]". */
  sheetTop: string;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div
        className={cx(
          "absolute inset-x-0 top-0 overflow-hidden bg-map-ground",
          mapHeight,
        )}
      />

      <div className="absolute inset-x-4 top-13 z-20 flex items-center gap-2.5">
        <span className="flex size-[38px] items-center justify-center rounded-[10px] border border-hairline-strong bg-surface text-ink-muted shadow-panel">
          <Icon name="chevronLeft" size={18} />
        </span>
      </div>

      <main
        className={cx(
          "relative z-10 flex flex-1 animate-breathe flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet lg:mx-auto lg:w-[560px] lg:rounded-sheet lg:border",
          sheetTop,
        )}
      >
        <SheetBodySkeleton />
      </main>
    </div>
  );
}
