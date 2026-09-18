import type { Metadata } from "next";
import { places, savedFinds, savedPlaceIds, savedRoutes } from "@/data/explore";
import { TopBar } from "@/features/chrome";
import { PlaceRow } from "@/features/place-row";
import { ButtonLink } from "@/ui/button";
import { Card, Divider, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BottomNav, homeTabs } from "@/ui/nav";
import { Display, Prose, Title } from "@/ui/text";

export const metadata: Metadata = { title: "Saved" };

/**
 * Not on the canvas either. Laid out like Trips home — sections under ruled
 * eyebrows — because it is the same kind of screen: things you own, waiting to
 * become a plan. Routes come first since they turn into a trip in one step.
 */
export default function SavedPage() {
  const saved = places.filter((p) => savedPlaceIds.includes(p.id));

  return (
    <>
      <TopBar active="Saved" />

      <main className="flex-1 pb-24 lg:pb-0">
        <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-6 lg:py-10">
          <div className="flex items-start gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Display className="text-[25px] lg:text-[31px]">Saved</Display>
              <Prose>
                Routes, places and finds you kept. Any of them can start a trip
                — I re-check each one before it goes into a plan.
              </Prose>
            </div>
            <ButtonLink href="/explore" className="hidden lg:inline-flex">
              Explore more
            </ButtonLink>
          </div>

          <section className="flex flex-col gap-3">
            <SectionRule>Routes · {savedRoutes.length}</SectionRule>
            <div className="grid gap-3 lg:grid-cols-2">
              {savedRoutes.map((route) => (
                <Card key={route.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] border border-hairline bg-canvas text-ink-faint">
                      <Icon name="route" size={18} />
                    </span>
                    <div className="flex flex-1 flex-col gap-0.5">
                      <Title className="text-[16px]">{route.title}</Title>
                      <span className="text-mini text-ink-faint">
                        {route.from}
                      </span>
                    </div>
                    <Chip size="sm">
                      {route.days} days · {route.stops} stops
                    </Chip>
                  </div>
                  <Prose>{route.note}</Prose>
                  <div className="flex items-center gap-2">
                    <ButtonLink href="/new/building" size="sm">
                      Start a trip from this
                    </ButtonLink>
                    <ButtonLink href="/new" variant="ghost" size="sm">
                      Change it first
                    </ButtonLink>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionRule>Places · {saved.length}</SectionRule>
            <Card className="overflow-hidden lg:grid lg:grid-cols-2">
              {saved.map((place, i) => (
                <div
                  key={place.id}
                  className={
                    i > 0
                      ? "border-t border-hairline lg:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(even)]:border-l"
                      : undefined
                  }
                >
                  <PlaceRow place={place} saved />
                </div>
              ))}
            </Card>
          </section>

          <section className="flex flex-col gap-3">
            <SectionRule>Kept from your trips</SectionRule>
            <Card className="overflow-hidden">
              {savedFinds.map((find, i) => (
                <div key={find.id}>
                  {i > 0 ? <Divider /> : null}
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <Dot tone="agent" className="mt-1.5" />
                    <div className="flex flex-1 flex-col gap-0.5">
                      <span className="text-small font-semibold">
                        {find.title}
                      </span>
                      <span className="text-mini text-ink-muted">
                        {find.when}
                      </span>
                      <span className="text-mini text-ink-faint">
                        {find.from}
                      </span>
                    </div>
                    <ButtonLink href="/new" size="sm">
                      Plan around it
                    </ButtonLink>
                  </div>
                </div>
              ))}
            </Card>
            <p className="text-mini text-ink-faint">
              Opportunities the agent finds mid-trip land here when you save
              them instead of adding them.
            </p>
          </section>
        </div>
      </main>

      <BottomNav items={homeTabs} active="Saved" />
    </>
  );
}
