import { Divider, Panel } from "@/ui/card";
import { FilterChip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { Eyebrow, Headline, Prose } from "@/ui/text";
import { GROUPS } from "./explore-model";
import type { AreaChip } from "./explore-screen";

// Explore before its map and its results: the map's own ground colour, and the
// panels where they will be. It is drawn twice and must be the same twice — as
// the page's loading state (nothing is known yet) and as the screen's own first
// paint (the regions and the aside are known, the layout and the search are
// not) — so the regions and the aside are optional and become bars when absent.
//
// Both layouts are drawn and CSS picks one, because which applies is only known
// in the browser; the screen itself draws only one, to build only one map.

const bar = (className: string) => (
  <span
    className={cx(
      "inline-block rounded-[3px] bg-track align-middle",
      className,
    )}
  />
);

/** The search, the filters and a few rows: the catalogue's panel without its data. */
function BrowserShell({
  areas,
  total,
}: {
  areas?: AreaChip[];
  total?: number;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 px-4 pb-3">
        <div className="flex h-10 items-center gap-2.5 rounded-panel border border-hairline bg-surface-subtle px-3">
          <Icon name="search" size={16} className="text-ink-faint" />
          <span className="flex-1 text-small text-ink-faint">
            Search places, or try “monastery”
          </span>
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-hidden px-4">
          <FilterChip selected>
            All Georgia
            <span className="opacity-70">
              {total === undefined
                ? bar("h-[8px] w-[24px]")
                : total.toLocaleString("en-GB")}
            </span>
          </FilterChip>
          {areas
            ? areas.map((a) => (
                <FilterChip key={a.slug} selected={false}>
                  {a.name}
                  <span className="text-ink-faint">
                    {a.count.toLocaleString("en-GB")}
                  </span>
                </FilterChip>
              ))
            : [0, 1, 2, 3].map((i) => (
                <FilterChip key={i} selected={false}>
                  {bar("h-[8px] w-[48px]")}
                </FilterChip>
              ))}
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-hidden px-4">
          <FilterChip size="sm" selected>
            Everything
          </FilterChip>
          {GROUPS.map(([group, label]) => (
            <FilterChip key={group} size="sm" selected={false}>
              {label}
            </FilterChip>
          ))}
        </div>
      </div>

      <Divider />

      <div className="min-h-0 flex-1 animate-breathe overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>
            {i > 0 ? <Divider className="mx-4" /> : null}
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {bar("h-[8px] w-[70px]")}
                {bar("h-[12px] w-[60%]")}
                {bar("h-[9px] w-[40%]")}
                {bar("h-[8px] w-[55%]")}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="size-[30px] rounded-control bg-track" />
                <div className="h-[30px] w-[78px] rounded-control bg-track" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The aside's own panels when it is known; a panel of bars when it is not. */
function AsideShell({ aside }: { aside?: React.ReactNode }) {
  return aside ? (
    aside
  ) : (
    <Panel className="flex animate-breathe flex-col gap-3 p-3.5">
      {bar("h-[9px] w-[110px]")}
      {bar("h-[11px] w-[70%]")}
      {bar("h-[11px] w-[55%]")}
      {bar("h-[11px] w-[62%]")}
    </Panel>
  );
}

export function ExploreSkeleton({
  areas,
  total,
  aside,
}: {
  areas?: AreaChip[];
  total?: number;
  aside?: React.ReactNode;
}) {
  return (
    <>
      <div
        className="relative hidden flex-1 overflow-hidden bg-map-ground lg:block"
        aria-busy="true"
      >
        <span className="sr-only">Loading</span>
        <Panel className="absolute bottom-6 left-6 top-5 z-20 flex w-[420px] flex-col overflow-hidden">
          <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
            <Eyebrow>Explore Georgia</Eyebrow>
            <Headline>Places I can plan with</Headline>
            <Prose>
              {total === undefined ? (
                bar("h-[10px] w-[320px]")
              ) : (
                <>
                  {total.toLocaleString("en-GB")} places across four regions,
                  each checked before it can go into a plan.
                </>
              )}
            </Prose>
          </div>
          <BrowserShell areas={areas} total={total} />
        </Panel>
        <div className="absolute right-6 top-5 z-20 flex w-[340px] flex-col gap-3">
          <AsideShell aside={aside} />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col pb-20 lg:hidden">
        <div className="absolute inset-x-0 top-0 h-[200px] overflow-hidden bg-map-ground" />
        <main className="relative z-10 mt-[170px] flex flex-1 flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet">
          <div className="flex justify-center pb-1 pt-2">
            <span
              aria-hidden="true"
              className="h-1 w-9 rounded-full bg-control"
            />
          </div>
          <div className="flex flex-col gap-1 px-4 pb-3 pt-1">
            <Eyebrow>Explore Georgia</Eyebrow>
            <Headline>Places I can plan with</Headline>
          </div>
          <BrowserShell areas={areas} total={total} />
          <div className="flex flex-col gap-3 border-t border-hairline bg-canvas px-4 py-4">
            <AsideShell aside={aside} />
          </div>
        </main>
      </div>
    </>
  );
}
