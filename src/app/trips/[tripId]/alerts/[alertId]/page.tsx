import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { advisory, getTrip, roadAdvisory } from "@/data/trip";
import { Button, ButtonLink } from "@/ui/button";
import { Divider } from "@/ui/card";
import { Icon } from "@/ui/icon";
import { BasemapMobileAlert } from "@/ui/map/basemap-mobile-alert";
import { Display, Eyebrow, Num } from "@/ui/text";

export const metadata: Metadata = { title: "Alert" };

export default async function AlertPage({
  params,
}: PageProps<"/trips/[tripId]/alerts/[alertId]">) {
  const { tripId, alertId } = await params;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  // The road advisory is the fullest form of the card: it carries an "I did"
  // line, because the agent already found the detour before interrupting.
  const alert = alertId === advisory.id ? advisory : roadAdvisory;
  const acted = alert.id === roadAdvisory.id;

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="absolute inset-x-0 top-0 h-[420px] overflow-hidden">
        <BasemapMobileAlert className="absolute inset-0 size-full" />
      </div>

      <div className="absolute inset-x-3 top-13 z-20 flex h-11 items-center gap-2.5 rounded-[13px] border border-alert-line bg-surface/95 px-3 shadow-panel">
        <span className="size-[7px] rounded-full bg-alert" />
        <span className="flex-1 text-small font-semibold">
          Route disruption ahead
        </span>
        <Num className="text-mini text-ink-faint">JUST NOW</Num>
        <Link
          href={`/trips/${trip.id}/alerts`}
          aria-label="Close"
          className="text-ink-faint"
        >
          <Icon name="close" size={16} />
        </Link>
      </div>

      <main className="relative z-10 mt-[354px] flex flex-1 flex-col rounded-t-[20px] border-t border-hairline bg-surface shadow-sheet lg:mx-auto lg:mt-[300px] lg:w-[560px] lg:rounded-[20px] lg:border">
        <div className="flex justify-center pb-0.5 pt-2.5">
          <span
            aria-hidden="true"
            className="h-1 w-9 rounded-full bg-control"
          />
        </div>

        <div className="flex flex-col gap-3 px-[18px] pt-2.5">
          <div className="flex items-center gap-2">
            <Icon name="warning" size={16} className="text-alert" />
            <Eyebrow tone="alert">{alert.kind}</Eyebrow>
          </div>

          <Display className="text-[24px]">{alert.headline}</Display>

          {/* Changed / Affects / I did — the same three questions, in the same
              order, every time. */}
          <div className="overflow-hidden rounded-panel border border-hairline">
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Eyebrow className="w-[66px] shrink-0 pt-0.5">Changed</Eyebrow>
              <span className="flex-1 text-small">{alert.changed}</span>
            </div>
            <Divider />
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Eyebrow className="w-[66px] shrink-0 pt-0.5">Affects</Eyebrow>
              <span className="flex-1 text-small">{alert.affects}</span>
            </div>
            <Divider />
            <div className="flex items-start gap-3 bg-surface-subtle px-3.5 py-3">
              <Eyebrow className="w-[66px] shrink-0 pt-0.5">
                {acted ? "I did" : "I suggest"}
              </Eyebrow>
              <span className="flex-1 text-small">{alert.suggestion}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex flex-1 flex-col gap-0.5">
              <Eyebrow>Now</Eyebrow>
              <Num className="text-small font-medium text-ink-muted">
                16:30 arrival
              </Num>
            </div>
            <Icon name="arrowRight" size={18} className="text-ink-faint" />
            <div className="flex flex-1 flex-col items-end gap-0.5">
              <Eyebrow tone="agent">With detour</Eyebrow>
              <Num className="text-small font-semibold text-agent">
                15:32 arrival
              </Num>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-2.5 px-[18px] pb-[22px] pt-4">
          <ButtonLink
            href={`/trips/${trip.id}?state=applied`}
            variant="primary"
            size="lg"
            block
          >
            Apply new route
          </ButtonLink>
          <div className="flex gap-2.5">
            <ButtonLink
              href={`/trips/${trip.id}/replan`}
              size="lg"
              className="flex-1"
            >
              View changes (3)
            </ButtonLink>
            <Button size="lg" className="flex-1">
              Keep current plan
            </Button>
          </div>
          <div className="flex items-center justify-center gap-1.5 pt-0.5">
            <Icon name="info" size={13} className="text-ink-faint" />
            <span className="text-mini text-ink-faint">{alert.evidence}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
