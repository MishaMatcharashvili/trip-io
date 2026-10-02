import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { savedPlaces } from "@/bll/saved";
import { myTrips } from "@/bll/trip-screen";
import { PageColumn } from "@/features/page-column";
import { SaveToggle } from "@/features/save-toggle";
import { SiteFrame } from "@/features/site-frame";
import { PlanAgainButton } from "@/features/trip-actions";
import { dateRange } from "@/features/trip-model";
import { getAuth } from "@/infra/auth";
import { ButtonLink } from "@/ui/button";
import { Card, Divider, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Icon } from "@/ui/icon";
import { Eyebrow, Prose, Title } from "@/ui/text";

export const metadata: Metadata = { title: "Saved" };

const groupNames: Record<string, string> = {
  heritage: "Heritage",
  nature: "Nature",
  food: "Food & wine",
  culture: "Culture",
  lodging: "Stay",
  transport: "Getting around",
};

/**
 * Not on the canvas either. Laid out like Trips home — sections under ruled
 * eyebrows — because it is the same kind of screen: things you own, waiting to
 * become a plan. Your own trips come first, since they turn into a new one in
 * one step.
 */
import { SavedHeading } from "./heading";

export default async function SavedPage() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  const [places, trips] = session
    ? await Promise.all([
        savedPlaces(session.user.id),
        myTrips(session.user.id),
      ])
    : [[], []];

  return (
    <SiteFrame active="Saved" tab="Saved">
      <PageColumn>
        <SavedHeading />

        {!session ? (
          <Card className="flex flex-col gap-3 p-5">
            <Prose>Sign in to keep places and plan your trips again.</Prose>
            <div>
              <ButtonLink href="/sign-in?next=/saved" variant="primary">
                Sign in
              </ButtonLink>
            </div>
          </Card>
        ) : null}

        {trips.length ? (
          <section className="flex flex-col gap-3">
            <SectionRule>Your trips · {trips.length}</SectionRule>
            <div className="grid gap-3 lg:grid-cols-2">
              {trips.map((trip) => (
                <Card key={trip.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] border border-hairline bg-canvas text-ink-faint">
                      <Icon name="route" size={18} />
                    </span>
                    <Link
                      href={`/trips/${trip.id}/trip`}
                      className="flex flex-1 flex-col gap-0.5 hover:text-agent"
                    >
                      <Title className="text-[16px]">{trip.title}</Title>
                      <span className="text-mini text-ink-faint">
                        {dateRange(trip.startsAt, trip.endsAt)}
                      </span>
                    </Link>
                    <Chip size="sm">{trip.stops} stops</Chip>
                  </div>
                  <div className="flex items-center gap-2">
                    <PlanAgainButton tripId={trip.id} />
                  </div>
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {session ? (
          <section className="flex flex-col gap-3">
            <SectionRule>Places · {places.length}</SectionRule>
            {places.length ? (
              <Card className="overflow-hidden lg:grid lg:grid-cols-2">
                {places.map((place, i) => (
                  <div
                    key={place.id}
                    className={
                      i > 0
                        ? "border-t border-hairline lg:[&:nth-child(2)]:border-t-0 lg:[&:nth-child(even)]:border-l"
                        : undefined
                    }
                  >
                    <div className="flex items-start gap-3 px-4 py-3.5">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Eyebrow>
                          {groupNames[place.group] ?? place.group}
                        </Eyebrow>
                        <Title>{place.name}</Title>
                        <p className="text-mini text-ink-muted">
                          {[place.category.replace(/_/g, " "), place.nameKa]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <SaveToggle
                        name={place.name}
                        placeId={place.id}
                        defaultSaved
                      />
                    </div>
                  </div>
                ))}
              </Card>
            ) : (
              <Card className="flex items-center gap-3 px-4 py-3.5">
                <Prose className="flex-1">
                  Nothing kept yet. Save places from Explore or from a stop in
                  your trip.
                </Prose>
                <ButtonLink href="/explore" size="sm">
                  Explore
                </ButtonLink>
              </Card>
            )}
          </section>
        ) : null}

        <section className="flex flex-col gap-3">
          <SectionRule>Kept from your trips</SectionRule>
          <Card className="px-4 py-3.5">
            <Prose>
              Nothing yet. When the watch finds something worth knowing mid-trip
              — a festival, a market day — and you keep it instead of adding it,
              it lands here.
            </Prose>
          </Card>
        </section>

        <Divider className="lg:hidden" />
      </PageColumn>
    </SiteFrame>
  );
}
