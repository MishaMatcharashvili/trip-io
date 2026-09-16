import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { alertHistory, getTrip, watchLedger } from "@/data/trip";
import { TopBar } from "@/features/chrome";
import { Card, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BottomNav, tripTabs } from "@/ui/nav";
import { Eyebrow, Num, Title } from "@/ui/text";

export const metadata: Metadata = { title: "Everything I have told you" };

const outcomeLabels = {
  accepted: { label: "Applied", tone: "agent" as const },
  dismissed: { label: "Kept plan", tone: "neutral" as const },
  ignored: { label: "No answer", tone: "neutral" as const },
  saved: { label: "Saved", tone: "neutral" as const },
  resolved: { label: "Resolved", tone: "neutral" as const },
};

export default async function AlertsPage({
  params,
}: PageProps<"/trips/[tripId]/alerts">) {
  const { tripId } = await params;
  const trip = getTrip(tripId);
  if (!trip) notFound();

  const groups = ["Today", "Yesterday"] as const;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar trip={trip} tabs={tripTabs(trip.id)} active="AI" />

      {/*
        The trust screen. Every alert, what you did about it, and the raw check
        count behind them — which is also the renewal argument.
      */}
      <div className="border-b border-hairline bg-surface lg:border-0 lg:bg-transparent">
        <div className="mx-auto w-full max-w-[720px] px-4 pb-3 pt-2.5 lg:pt-8">
          <div className="flex items-center gap-2.5 pb-3">
            <div className="flex-1">
              <Title className="text-[16px] lg:text-headline">
                Everything I have told you
              </Title>
              <Eyebrow>
                {trip.title.split(" · ")[0]} · {trip.currentDay} days in
              </Eyebrow>
            </div>
            <button
              type="button"
              aria-label="Filter"
              className="p-1 text-ink-muted"
            >
              <Icon name="filter" size={20} />
            </button>
          </div>

          <div className="flex">
            {[
              { value: "6", label: "Told you", tone: "" },
              { value: "4", label: "Applied", tone: "text-agent" },
              { value: "2", label: "Kept your plan", tone: "" },
              { value: "4,310", label: "Checks run", tone: "" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-1 flex-col gap-0.5">
                <Num className={cx("text-[17px] font-semibold", stat.tone)}>
                  {stat.value}
                </Num>
                <Eyebrow>{stat.label}</Eyebrow>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-3.5 px-4 pb-28 pt-3.5 lg:pb-10">
        {groups.map((group) => (
          <section key={group} className="flex flex-col gap-2.5">
            <SectionRule>{group}</SectionRule>
            {alertHistory
              .filter((alert) => alert.day === group)
              .map((alert) => {
                const outcome = outcomeLabels[alert.outcome];
                return (
                  <Link
                    key={alert.id}
                    href={`/trips/${trip.id}/alerts/${alert.id}`}
                  >
                    <Card
                      accent={
                        alert.tone === "alert" && alert.day === "Today"
                          ? "alert"
                          : "none"
                      }
                      className={cx(
                        "flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-canvas",
                        alert.outcome === "dismissed" && "opacity-70",
                      )}
                    >
                      <Dot tone={alert.tone} className="mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-small font-semibold">
                          {alert.title}
                        </div>
                        <div className="text-mini text-ink-muted">
                          {alert.detail}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Num className="text-mini text-ink-faint">
                          {alert.time}
                        </Num>
                        <Chip
                          size="sm"
                          tone={outcome.tone}
                          className="h-5 text-micro"
                        >
                          {outcome.label}
                        </Chip>
                      </div>
                    </Card>
                  </Link>
                );
              })}
          </section>
        ))}

        <div className="flex flex-col items-center gap-2 pt-1">
          <button type="button" className="text-small font-medium text-agent">
            Earlier in this trip
          </button>
          <span className="text-mini text-ink-faint">
            {watchLedger[0].value} checks run · {watchLedger[1].value} worth
            telling you
          </span>
        </div>
      </main>

      <BottomNav items={tripTabs(trip.id)} active="AI" />
    </div>
  );
}
