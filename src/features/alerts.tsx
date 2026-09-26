import Link from "next/link";
import type { Trip } from "@/data/trip";
import { TopBar } from "@/features/chrome";
import { Card, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx, type Tone } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
import { BottomNav, tripTabs } from "@/ui/nav";
import { Eyebrow, Num, Title } from "@/ui/text";

/**
 * The trust screen, as one component over one view model: every alert, what
 * you did about it, and the raw check count behind them — which is also the
 * renewal argument. It renders the same whether the rows came from
 * `intervention` or from the fixtures behind `/design`.
 */

export type AlertRowView = {
  id: string;
  time: string;
  title: string;
  detail: string;
  tone: Tone;
  outcome: { label: string; tone: Tone };
  /** An answered "keep my plan": still listed, quieter. */
  dim?: boolean;
  /** Coral edge — reserved for today's live disruptions. */
  urgent?: boolean;
};

export type AlertsView = {
  tripId: string;
  /** The fixture trip, for the desktop header; real trips have none yet. */
  trip?: Trip;
  eyebrow: string;
  stats: { value: string; label: string; tone?: "agent" }[];
  groups: { label: string; alerts: AlertRowView[] }[];
  footer: string;
};

export function AlertsScreen({ view }: { view: AlertsView }) {
  const empty = view.groups.every((g) => g.alerts.length === 0);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar trip={view.trip} tabs={tripTabs(view.tripId)} active="AI" />

      <div className="border-b border-hairline bg-surface lg:border-0 lg:bg-transparent">
        <div className="mx-auto w-full max-w-[720px] px-4 pb-3 pt-2.5 lg:pt-8">
          <div className="flex items-center gap-2.5 pb-3">
            <div className="flex-1">
              <Title className="text-[16px] lg:text-headline">
                Everything I have told you
              </Title>
              <Eyebrow>{view.eyebrow}</Eyebrow>
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
            {view.stats.map((stat) => (
              <div key={stat.label} className="flex flex-1 flex-col gap-0.5">
                <Num
                  className={cx(
                    "text-[17px] font-semibold",
                    stat.tone === "agent" && "text-agent",
                  )}
                >
                  {stat.value}
                </Num>
                <Eyebrow>{stat.label}</Eyebrow>
              </div>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-3.5 px-4 pb-28 pt-3.5 lg:pb-10">
        {empty ? (
          <Card className="flex items-start gap-3 px-3.5 py-3">
            <Dot tone="agent" className="mt-1.5" />
            <div className="flex-1">
              <div className="text-small font-semibold">
                Nothing to tell you yet
              </div>
              <div className="text-mini text-ink-muted">
                When something on your route changes, it will be listed here
                with what you decided.
              </div>
            </div>
          </Card>
        ) : null}

        {view.groups
          .filter((group) => group.alerts.length > 0)
          .map((group) => (
            <section key={group.label} className="flex flex-col gap-2.5">
              <SectionRule>{group.label}</SectionRule>
              {group.alerts.map((alert) => (
                <Link
                  key={alert.id}
                  href={`/trips/${view.tripId}/alerts/${alert.id}`}
                >
                  <Card
                    accent={alert.urgent ? "alert" : "none"}
                    className={cx(
                      "flex items-start gap-3 px-3.5 py-3 transition-colors hover:bg-canvas",
                      alert.dim && "opacity-70",
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
                        tone={alert.outcome.tone}
                        className="h-5 text-micro"
                      >
                        {alert.outcome.label}
                      </Chip>
                    </div>
                  </Card>
                </Link>
              ))}
            </section>
          ))}

        <div className="flex flex-col items-center gap-2 pt-1">
          <span className="text-mini text-ink-faint">{view.footer}</span>
        </div>
      </main>

      <BottomNav items={tripTabs(view.tripId)} active="AI" />
    </div>
  );
}
