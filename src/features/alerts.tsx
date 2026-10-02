import Link from "next/link";
import type { Trip } from "@/data/trip";
import { Card, SectionRule } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx, type Tone } from "@/ui/cx";
import { Dot } from "@/ui/dot";
import { Icon } from "@/ui/icon";
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

/** The four figures at the head of the record, in the order they are shown. */
const STATS = [
  { label: "Told you" },
  { label: "Applied", tone: "agent" as const },
  { label: "Kept your plan" },
  { label: "Checks run" },
];

/** The record's figures, with their labels and tones: only the values are data. */
export function alertStats(values: readonly string[]): AlertsView["stats"] {
  return STATS.map((stat, i) => ({ ...stat, value: values[i] ?? "—" }));
}

type FrameStat = { value: React.ReactNode; label: string; tone?: "agent" };

/**
 * The record's frame: its heading, its figures and its column. Drawn by the
 * screen with the trip's numbers and by the loading state with bars, so the
 * two are one layout.
 */
function AlertsFrame({
  eyebrow,
  stats,
  children,
}: {
  eyebrow: React.ReactNode;
  stats: FrameStat[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-hairline bg-surface lg:border-0 lg:bg-transparent">
        <div className="mx-auto w-full max-w-[720px] px-4 pb-3 pt-2.5 lg:pt-8">
          <div className="flex items-center gap-2.5 pb-3">
            <div className="flex-1">
              <Title className="text-[16px] lg:text-headline">
                Everything I have told you
              </Title>
              <Eyebrow>{eyebrow}</Eyebrow>
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
            {stats.map((stat) => (
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
        {children}
      </main>
    </div>
  );
}

const bar = (className: string) => (
  <span className={cx("inline-block rounded-[3px] bg-track", className)} />
);

/** The record before it is known: its own frame, and a few rows of grey. */
export function AlertsSkeleton() {
  return (
    <AlertsFrame
      eyebrow={bar("h-[9px] w-[160px]")}
      stats={STATS.map((stat) => ({
        ...stat,
        value: bar("h-[15px] w-[28px]"),
      }))}
    >
      <div className="flex animate-breathe flex-col gap-2.5" aria-busy="true">
        <SectionRule>Recent</SectionRule>
        {[0, 1, 2].map((i) => (
          <Card key={i} className="flex items-start gap-3 px-3.5 py-3">
            <span className="mt-1.5 size-[9px] shrink-0 rounded-full bg-track" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {bar("h-[11px] w-[60%]")}
              {bar("h-[9px] w-[85%]")}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              {bar("h-[9px] w-[32px]")}
              {bar("h-5 w-[58px] rounded-full")}
            </div>
          </Card>
        ))}
      </div>
    </AlertsFrame>
  );
}

export function AlertsScreen({ view }: { view: AlertsView }) {
  const empty = view.groups.every((g) => g.alerts.length === 0);

  return (
    <AlertsFrame eyebrow={view.eyebrow} stats={view.stats}>
      {empty ? (
        <Card className="flex items-start gap-3 px-3.5 py-3">
          <Dot tone="agent" className="mt-1.5" />
          <div className="flex-1">
            <div className="text-small font-semibold">
              Nothing to tell you yet
            </div>
            <div className="text-mini text-ink-muted">
              When something on your route changes, it will be listed here with
              what you decided.
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
                    <Num className="text-mini text-ink-faint">{alert.time}</Num>
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
    </AlertsFrame>
  );
}
