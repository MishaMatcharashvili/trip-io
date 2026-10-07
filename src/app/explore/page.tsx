import type { Metadata } from "next";
import { roadSeason } from "@/domain/catalogue/road-season";
import { Summary } from "@/features/accordion-summary";
import { type AreaChip, ExploreScreen } from "@/features/explore-screen";
import { RoadsThisSeason } from "@/features/roads-this-season";
import { areaCounts, tbilisiToday } from "@/features/shared-reads";
import { SiteFrame } from "@/features/site-frame";
import { ButtonLink } from "@/ui/button";
import { Panel } from "@/ui/card";
import { Dot } from "@/ui/dot";
import { Eyebrow, Prose, Title } from "@/ui/text";

export const metadata: Metadata = { title: "Explore" };

/**
 * Not on the canvas, which stubbed Explore in the nav only. Built in the same
 * map-first grammar as the active trip: the map is the canvas, the catalogue
 * floats over it on the left, and what is known about the roads sits on the
 * right — so the product is useful before there is a trip to watch.
 */

const areaNames: Record<string, string> = {
  "tbilisi-core": "Tbilisi",
  "kazbegi-corridor": "Kazbegi",
  kakheti: "Kakheti",
  svaneti: "Svaneti",
};

const monthName = (month: number) =>
  new Date(Date.UTC(2026, month - 1, 15)).toLocaleDateString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });

/** Rtveli, the harvest: worth knowing in September and October only. */
function SeasonFind() {
  return (
    <details className="group">
      <Summary className="bg-canvas px-4 py-2.5">
        <Dot tone="agent" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Eyebrow>Worth knowing · no action</Eyebrow>
          <Title className="truncate text-[15px]">
            Rtveli in Kakheti until mid-October
          </Title>
        </div>
      </Summary>
      <div className="flex flex-col gap-2.5 border-t border-hairline p-4">
        <Prose>
          The grape harvest. Most cellars let you pick and press with them, and
          the feasts run late. It is the best two weeks of the year for a wine
          weekend.
        </Prose>
        <div>
          <ButtonLink href="/#plan" size="sm">
            Plan a Kakheti weekend
          </ButtonLink>
        </div>
      </div>
    </details>
  );
}

export default async function ExplorePage() {
  const [today, counts] = await Promise.all([tbilisiToday(), areaCounts()]);
  const month = Number(today.slice(5, 7)) || 1;
  const areas: AreaChip[] = counts.map((c) => ({
    slug: c.slug,
    name: areaNames[c.slug] ?? c.slug,
    count: c.curated + c.verified,
  }));
  const total = areas.reduce((sum, a) => sum + a.count, 0);

  return (
    <SiteFrame active="Explore" tab="Explore">
      <ExploreScreen
        areas={areas}
        total={total}
        aside={
          <>
            <Panel className="overflow-hidden">
              <RoadsThisSeason
                monthName={monthName(month)}
                roads={roadSeason(month)}
              />
            </Panel>
            {month === 9 || month === 10 ? (
              <Panel className="overflow-hidden">
                <SeasonFind />
              </Panel>
            ) : null}
          </>
        }
      />
    </SiteFrame>
  );
}
