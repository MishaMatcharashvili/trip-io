"use client";

import type { RoadSeason } from "@/domain/catalogue/road-season";
import { Divider } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Eyebrow, Title } from "@/ui/text";
import { Summary } from "./accordion-summary";
import { useExploreArea } from "./explore-area";

/**
 * What the season says about the roads, for the region being explored. With
 * none chosen, only the roads with something to say: a quiet road is the
 * default, and a list of them is not news.
 */
export function RoadsThisSeason({
  monthName,
  roads,
}: {
  monthName: string;
  roads: RoadSeason[];
}) {
  const area = useExploreArea();
  const shown = (
    area
      ? roads.filter((r) => (r.areas as string[]).includes(area.slug))
      : roads.filter((r) => r.tone === "alert")
  )
    // The hazards first.
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "alert" ? -1 : 1));

  return (
    <details className="group">
      <Summary className="px-4 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Eyebrow>
            {area ? `Roads · ${area.name}` : "Roads this season"} · {monthName}
          </Eyebrow>
          <Title>What I already know about getting there</Title>
        </div>
      </Summary>
      <Divider />
      <div className="flex flex-col px-4 py-2">
        {shown.length === 0 ? (
          <p className="py-2.5 text-small text-ink-faint">
            No seasonal hazard on the roads this month.
          </p>
        ) : (
          shown.map((road, i) => (
            <div
              key={road.slug}
              className={cx(
                "flex items-start gap-2.5 py-2.5",
                i > 0 && "border-t border-track",
              )}
            >
              <Dot tone={road.tone} className="mt-1.5" />
              <div className="flex-1">
                <div className="text-small font-medium">{road.name}</div>
                <div
                  className={cx(
                    "text-mini",
                    road.tone === "alert" ? "text-alert" : "text-ink-faint",
                  )}
                >
                  {road.status}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <p className="px-4 pb-3 text-micro text-ink-faint">
        The usual season, not today’s road. A watched trip gets the live
        reports.
      </p>
    </details>
  );
}
