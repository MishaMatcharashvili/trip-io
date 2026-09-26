import type { Metadata } from "next";
import { catalogueByArea } from "@/bll/places";
import { type RoadSeason, roadSeason } from "@/domain/catalogue/road-season";
import { TopBar } from "@/features/chrome";
import { type AreaChip, ExploreScreen } from "@/features/explore-screen";
import { ButtonLink } from "@/ui/button";
import { Divider, Panel } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { BottomNav, homeTabs } from "@/ui/nav";
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

function RoadsThisSeason({
  month,
  roads,
}: {
  month: number;
  roads: RoadSeason[];
}) {
  // The hazards first: a quiet road is the default, and the list is short.
  const shown = [...roads]
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "alert" ? -1 : 1))
    .slice(0, 6);
  return (
    <div>
      <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
        <Eyebrow>Roads this season · {monthName(month)}</Eyebrow>
        <Title>What I already know about getting there</Title>
      </div>
      <Divider />
      <div className="flex flex-col px-4 py-2">
        {shown.map((road, i) => (
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
        ))}
      </div>
      <p className="px-4 pb-3 text-micro text-ink-faint">
        The usual season, not today’s road. A watched trip gets the live
        reports.
      </p>
    </div>
  );
}

/** Rtveli, the harvest: worth knowing in September and October only. */
function SeasonFind() {
  return (
    <div>
      <div className="flex items-center gap-2.5 border-b border-hairline bg-canvas px-4 py-2.5">
        <Dot tone="agent" />
        <Eyebrow>Worth knowing · no action</Eyebrow>
      </div>
      <div className="flex flex-col gap-2.5 p-4">
        <Title className="text-[15px]">
          Rtveli in Kakheti until mid-October
        </Title>
        <Prose>
          The grape harvest. Most cellars let you pick and press with them, and
          the feasts run late. It is the best two weeks of the year for a wine
          weekend.
        </Prose>
        <div>
          <ButtonLink href="/new" size="sm">
            Plan a Kakheti weekend
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

export default async function ExplorePage() {
  const month =
    Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Tbilisi",
        month: "numeric",
      }).format(new Date()),
    ) || 1;
  const counts = await catalogueByArea();
  const areas: AreaChip[] = counts.map((c) => ({
    slug: c.slug,
    name: areaNames[c.slug] ?? c.slug,
    count: c.curated + c.verified,
  }));
  const total = areas.reduce((sum, a) => sum + a.count, 0);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar active="Explore" />

      <ExploreScreen
        areas={areas}
        total={total}
        aside={
          <>
            <Panel className="overflow-hidden">
              <RoadsThisSeason month={month} roads={roadSeason(month)} />
            </Panel>
            {month === 9 || month === 10 ? (
              <Panel className="overflow-hidden">
                <SeasonFind />
              </Panel>
            ) : null}
          </>
        }
      />

      <BottomNav items={homeTabs} active="Explore" />
    </div>
  );
}
