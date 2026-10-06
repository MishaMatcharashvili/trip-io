import { WatchStrip } from "@/features/watch-strip";
import { Button } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { Sheet, SheetStage } from "@/ui/sheet";
import {
  COMMAND_BAR_FRAME,
  ITINERARY_FRAME,
  RIGHT_COLUMN_FRAME,
  WATCH_STRIP_FRAME,
} from "./desktop";

// The map screen before it has its trip: the map's own ground colour where the
// map will be (the map itself is borrowed from the pool and arrives with the
// page), and the panels floating where they will float. Their positions are
// the real panels' own (desktop.tsx), what is static is drawn as it is — the
// command bar, the strip's names — and only what is data is a grey bar.

const bar = (className: string) => (
  <div className={cx("rounded-[3px] bg-track", className)} />
);

/** A stop's row in the itinerary: a time, a dot, two lines. */
function RowSkeleton({ widths }: { widths: [string, string] }) {
  return (
    <div className="flex items-start gap-[11px] px-4 py-2.5">
      <div className="w-[38px] shrink-0 pt-0.5">{bar("h-[9px] w-[30px]")}</div>
      <span className="mt-1.5 size-[9px] shrink-0 rounded-full bg-track" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {bar(`h-[11px] ${widths[0]}`)}
        {bar(`h-[9px] ${widths[1]}`)}
      </div>
    </div>
  );
}

/** The ask-a-question bar, which is the same bar before and after. */
function CommandBarShell({
  compact,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div
        className={cx(
          "flex w-full items-center gap-3 rounded-panel border bg-surface pl-4 pr-1.5",
          compact
            ? "h-[46px] border-hairline bg-surface-subtle"
            : "h-[50px] border-hairline-strong shadow-panel",
        )}
      >
        <Icon name="sparkle" size={17} className="text-agent" />
        <span className="flex-1 text-title text-ink-faint">
          Ask about your trip
        </span>
        <span
          className={cx(
            "flex items-center justify-center bg-agent text-on-accent opacity-60",
            compact
              ? "size-[34px] rounded-[9px]"
              : "size-[38px] rounded-control",
          )}
        >
          <Icon
            name="arrowRight"
            size={15}
            strokeWidth={1.8}
            className="-rotate-90"
          />
        </span>
      </div>
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div
      className="relative flex-1 overflow-hidden bg-map-ground"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>

      <div className="hidden animate-breathe lg:block">
        <Panel className={ITINERARY_FRAME}>
          <div className="flex items-start gap-2.5 px-4 pb-[11px] pt-3.5">
            <div className="flex flex-1 flex-col gap-1.5">
              {bar("h-[9px] w-[44px]")}
              {bar("h-[17px] w-[170px]")}
            </div>
            <div className="pt-3">{bar("h-[9px] w-[52px]")}</div>
          </div>
          <div className="flex gap-1.5 overflow-hidden px-4 pb-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-[42px] w-[44px] shrink-0 rounded-[10px] bg-track"
              />
            ))}
          </div>
          <div className="px-4 pb-3">
            <div className="h-[52px] rounded-[6px] bg-track" />
          </div>
          <Divider />
          {RowWidths.map((widths) => (
            <RowSkeleton key={widths.join()} widths={widths} />
          ))}
          <Divider />
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className="text-small font-medium text-agent">
              Open full trip
            </span>
            <div className="flex-1" />
            <Button size="sm" disabled>
              Add stop
            </Button>
          </div>
        </Panel>

        <div className={RIGHT_COLUMN_FRAME}>
          <Panel className="flex flex-col gap-3 p-3.5">
            {bar("h-[9px] w-[96px]")}
            {bar("h-[15px] w-[240px]")}
            {bar("h-[9px] w-[300px]")}
            {bar("h-[9px] w-[210px]")}
          </Panel>
        </div>

        {/* The strip's names are static; its counts are what arrive. */}
        <WatchStrip
          detectors={[
            { name: "Weather", tone: "idle", count: 0 },
            { name: "Roads", tone: "idle", count: 0 },
            { name: "Open", tone: "idle", count: 0 },
          ]}
          className={WATCH_STRIP_FRAME}
        />
        <CommandBarShell className={COMMAND_BAR_FRAME} />
      </div>

      <div className="animate-breathe lg:hidden">
        <div className="absolute inset-x-3 top-13 z-20 flex h-12 items-center gap-2.5 rounded-[13px] border border-hairline-strong bg-surface px-3 shadow-panel">
          <Icon name="signal" size={18} className="text-agent" />
          <div className="flex flex-1 flex-col gap-1.5">
            {bar("h-[11px] w-[140px]")}
            {bar("h-[8px] w-[80px]")}
          </div>
          <span className="size-1.5 rounded-full bg-track" />
        </div>

        <SheetStage>
          <Sheet>
            <div className="flex items-start gap-2.5 px-4 pb-2.5 pt-1">
              <div className="flex flex-1 flex-col gap-1.5">
                {bar("h-[9px] w-[40px]")}
                {bar("h-[15px] w-[180px]")}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                {bar("h-[11px] w-[40px]")}
                {bar("h-[8px] w-[56px]")}
              </div>
            </div>
            <Divider className="mx-4" />
            <div className="flex items-center gap-[11px] px-4 py-3 short:hidden">
              <div className="w-10">{bar("h-[9px] w-[30px]")}</div>
              <div className="flex flex-1 flex-col gap-1.5">
                {bar("h-[11px] w-[150px]")}
                {bar("h-[9px] w-[100px]")}
              </div>
              <Icon name="chevronRight" size={16} className="text-ink-faint" />
            </div>
            <div className="flex items-center gap-3 px-4 pb-2.5 short:hidden">
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-[42px] w-[44px] shrink-0 rounded-[10px] bg-track"
                  />
                ))}
              </div>
              <span className="shrink-0 text-mini font-medium text-agent">
                Open day
              </span>
            </div>
            <CommandBarShell
              compact
              className="mx-4 mb-3.5 landscape-short:hidden"
            />
          </Sheet>
        </SheetStage>
      </div>
    </div>
  );
}

const RowWidths: [string, string][] = [
  ["w-[170px]", "w-[110px]"],
  ["w-[140px]", "w-[90px]"],
  ["w-[190px]", "w-[120px]"],
  ["w-[150px]", "w-[100px]"],
  ["w-[130px]", "w-[80px]"],
];
