import { SkeletonLine } from "@/ui/bars";
import { Card, Divider } from "@/ui/card";
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

/**
 * A page outside a trip: a heading and a column of cards. `max` is the page's
 * own column width and `active` the top-bar link it belongs under, so a page
 * that is narrower than the usual one is drawn narrower while it loads.
 */
export function PageSkeleton({
  max = "1080px",
  active,
}: {
  max?: string;
  active?: string;
}) {
  return (
    <>
      <TopBar watch="none" active={active} />
      <main className="flex-1 pb-24 lg:pb-0" aria-busy="true">
        <span className="sr-only">Loading</span>
        <div
          style={{ maxWidth: max }}
          className="mx-auto flex w-full animate-breathe flex-col gap-6 px-4 py-6 lg:px-0 lg:py-10"
        >
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
