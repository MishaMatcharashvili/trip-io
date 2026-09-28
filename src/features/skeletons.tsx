import { SkeletonLine } from "@/ui/bars";
import { Card, Divider, Panel } from "@/ui/card";
import { cx } from "@/ui/cx";
import { BottomNav, homeTabs } from "@/ui/nav";
import { TopBar } from "./chrome";

// What a page shows while its own data streams in. With Cache Components these
// are the static shell: served at once from the CDN on a first visit, and
// shown the moment a link is clicked, while the page itself waits on the
// session and the database. They draw the product's chrome and put grey where
// the content will be, in the neutral track colour, so the three colours that
// mean something (agent, disruption, all clear) never appear before there is
// anything for them to mean.

/** A block of grey the size of a heading. */
function Bar({ className }: { className?: string }) {
  return <div className={cx("rounded-[4px] bg-track", className)} />;
}

function Lines({ widths }: { widths: string[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {widths.map((width) => (
        <SkeletonLine key={width} width={width} />
      ))}
    </div>
  );
}

/** A page outside the map: a heading and a column of cards. */
export function PageSkeleton() {
  return (
    <>
      <TopBar watch="none" />
      <main className="flex-1 pb-24 lg:pb-0" aria-busy="true">
        <span className="sr-only">Loading</span>
        <div className="mx-auto flex w-full max-w-[1080px] animate-breathe flex-col gap-6 px-4 py-6 lg:px-0 lg:py-10">
          <div className="flex flex-col gap-3">
            <Bar className="h-[26px] w-[42%] lg:h-[31px] lg:w-[28%]" />
            <SkeletonLine width="56%" />
          </div>
          <Card className="flex flex-col gap-4 p-5">
            <Bar className="h-[18px] w-[48%]" />
            <Lines widths={["82%", "64%", "71%"]} />
          </Card>
          <Card className="overflow-hidden">
            {["58%", "44%", "63%"].map((width, i) => (
              <div key={width}>
                {i > 0 ? <Divider /> : null}
                <div className="flex items-center gap-3 px-5 py-4">
                  <div className="size-[38px] shrink-0 rounded-[9px] bg-track" />
                  <div className="flex flex-1 flex-col gap-2">
                    <SkeletonLine width={width} />
                    <SkeletonLine width="32%" />
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </main>
      <BottomNav items={homeTabs} active="" />
    </>
  );
}

/**
 * The trip's map screen: the map's ground colour where the map will be, and
 * the day panel (the sheet, on a phone) floating over it. The map itself
 * arrives with the page, borrowed from the pool, so there is nothing to fake.
 */
export function TripMapSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      <TopBar watch="none" />
      <div className="relative flex-1 overflow-hidden bg-map-ground">
        <span className="sr-only">Loading</span>
        <Panel className="absolute bottom-6 left-6 top-5 hidden w-[350px] animate-breathe flex-col gap-5 p-4 lg:flex">
          <div className="flex flex-col gap-2.5">
            <SkeletonLine width="22%" />
            <Bar className="h-[20px] w-[64%]" />
          </div>
          <Bar className="h-[26px] w-full" />
          <Lines widths={["74%", "58%", "81%", "49%", "66%"]} />
        </Panel>
        <div className="absolute inset-x-0 bottom-0 flex animate-breathe flex-col gap-4 rounded-t-sheet border-t border-hairline bg-surface px-5 pb-28 pt-5 shadow-sheet lg:hidden">
          <Bar className="h-[20px] w-[58%]" />
          <Lines widths={["78%", "61%", "70%"]} />
        </div>
      </div>
    </div>
  );
}
