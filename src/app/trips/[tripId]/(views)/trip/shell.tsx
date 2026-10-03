import { SectionRule } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Display, Eyebrow, Num } from "@/ui/text";

// The Trip tab's frame, drawn by the page once it has the trip and by its
// loading state before. The same component draws both, so the skeleton has
// the page's own columns, headings, gutters and map, and only what is data
// is a grey bar.

/** The figures at the head of the plan, in the order they are shown. */
export const STAT_LABELS = ["Budget", "Places", "Changes handled"] as const;
/** The ledger beside the map. The reference trip's own labels differ. */
export const TOTAL_LABELS = [
  "Driving",
  "Busiest day",
  "Stops",
  "Changes I proposed",
] as const;

export type Figure = { label: string; value: React.ReactNode };

/** Labels with their values, in order: the values are all that is data. */
export const figures = (
  labels: readonly string[],
  values: readonly React.ReactNode[],
): Figure[] => labels.map((label, i) => ({ label, value: values[i] ?? "—" }));

export function WholeTripShell({
  eyebrow,
  stats,
  totals,
  map,
  switcher,
  days,
  actions,
}: {
  eyebrow: React.ReactNode;
  stats: Figure[];
  totals: Figure[];
  /** The whole trip's map, filling its box. */
  map: React.ReactNode;
  /** Which day the map and the list are on, when there is more than one. */
  switcher?: React.ReactNode;
  /** The days, each opening in place. */
  days: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex min-h-0 flex-1 items-stretch">
        <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pb-24 pt-6 lg:px-8 lg:py-7 lg:pb-7">
          <div className="flex items-start gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Eyebrow>{eyebrow}</Eyebrow>
              <Display className="text-[24px] lg:text-[29px]">
                The whole trip
              </Display>
            </div>
            <div className="hidden gap-5 lg:flex">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-end gap-0.5"
                >
                  <Eyebrow>{stat.label}</Eyebrow>
                  <Num className="text-[16px] font-semibold">{stat.value}</Num>
                </div>
              ))}
            </div>
          </div>

          {switcher}

          {/*
            Every day, with a watch status each. This is the table where the
            product stops being a planner: every row says not just what you are
            doing, but whether anything has moved under it. A day opens in
            place into its weather and its stops, and today opens first.
          */}
          {days}

          <div className="flex flex-wrap items-center gap-2.5">{actions}</div>
        </main>

        <aside className="hidden w-[460px] shrink-0 flex-col border-l border-hairline bg-surface lg:flex">
          <div className="relative h-[470px] overflow-hidden border-b border-hairline">
            {map}
          </div>
          <div className="flex flex-col gap-4 px-[26px] py-[22px]">
            <SectionRule>Across the whole trip</SectionRule>
            <div className="flex flex-col">
              {totals.map((total, i) => (
                <div
                  key={total.label}
                  className={cx(
                    "flex items-center gap-3 py-2.5",
                    i > 0 && "border-t border-track",
                  )}
                >
                  <span className="flex-1 text-small text-ink-muted">
                    {total.label}
                  </span>
                  <Num className="text-small font-semibold">{total.value}</Num>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
