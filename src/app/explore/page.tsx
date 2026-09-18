import type { Metadata } from "next";
import { roadSeason } from "@/data/explore";
import { TopBar } from "@/features/chrome";
import { ExploreBrowser } from "@/features/explore-browser";
import { ButtonLink } from "@/ui/button";
import { Card, Divider, Panel, SectionRule } from "@/ui/card";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { BasemapCalm } from "@/ui/map/basemap-calm";
import { BasemapMobile } from "@/ui/map/basemap-mobile";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Eyebrow, Headline, Prose, Title } from "@/ui/text";

export const metadata: Metadata = { title: "Explore" };

/**
 * Not on the canvas, which stubbed Explore in the nav only. Built in the same
 * map-first grammar as the active trip: the map is the canvas, the catalogue
 * floats over it on the left, and what the watch layer already knows about the
 * roads sits on the right — so the product is proactive before there is a trip
 * to be proactive about.
 */

function RoadsThisSeason({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
        <Eyebrow>Roads this season · September</Eyebrow>
        <Title>What I already know about getting there</Title>
      </div>
      <Divider />
      <div className="flex flex-col px-4 py-2">
        {roadSeason.map((road, i) => (
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
    </div>
  );
}

function SeasonFind({ className }: { className?: string }) {
  return (
    <div className={className}>
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

export default function ExplorePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar active="Explore" />

      {/* Desktop — map canvas with floating panels. */}
      <div className="relative hidden flex-1 overflow-hidden lg:block">
        <BasemapCalm className="absolute inset-0 size-full" />

        <Panel className="absolute bottom-6 left-6 top-5 z-20 flex w-[420px] flex-col overflow-hidden">
          <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
            <Eyebrow>Explore Georgia</Eyebrow>
            <Headline>Places I have checked by hand</Headline>
            <Prose>
              460 places across four regions, each verified — hours, access,
              season — before it can go into a plan.
            </Prose>
          </div>
          <ExploreBrowser />
        </Panel>

        <div className="absolute right-6 top-5 z-20 flex w-[340px] flex-col gap-3">
          <Panel className="overflow-hidden">
            <RoadsThisSeason />
          </Panel>
          <Panel className="overflow-hidden">
            <SeasonFind />
          </Panel>
        </div>
      </div>

      {/* Mobile — the map as a header, the catalogue as the sheet. */}
      <div className="relative flex flex-1 flex-col pb-20 lg:hidden">
        <div className="absolute inset-x-0 top-0 h-[180px] overflow-hidden">
          <BasemapMobile className="absolute inset-0 size-full" />
        </div>

        <main className="relative z-10 mt-[150px] flex flex-1 flex-col rounded-t-sheet border-t border-hairline bg-surface shadow-sheet">
          <div className="flex justify-center pb-1 pt-2">
            <span
              aria-hidden="true"
              className="h-1 w-9 rounded-full bg-control"
            />
          </div>
          <div className="flex flex-col gap-1 px-4 pb-3 pt-1">
            <Eyebrow>Explore Georgia</Eyebrow>
            <Headline>Places I have checked by hand</Headline>
          </div>
          <ExploreBrowser />

          <div className="flex flex-col gap-3 border-t border-hairline bg-canvas px-4 py-4">
            <SectionRule>Before you plan</SectionRule>
            <Card className="overflow-hidden">
              <RoadsThisSeason />
            </Card>
            <Card className="overflow-hidden">
              <SeasonFind />
            </Card>
          </div>
        </main>
      </div>

      <BottomNav items={homeTabs} active="Explore" />
    </div>
  );
}
