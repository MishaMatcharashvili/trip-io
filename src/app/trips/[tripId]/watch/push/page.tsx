import type { Metadata } from "next";
import Link from "next/link";
import { getTrip } from "@/data/trip";
import { MobileTitleBar, TopBar } from "@/features/chrome";
import { ago } from "@/features/trip-model";
import { cx } from "@/ui/cx";
import { Icon, type IconName } from "@/ui/icon";
import { Eyebrow } from "@/ui/text";
import { loadTrip } from "../../load";

export const metadata: Metadata = { title: "Push notifications" };

/**
 * Only disruptions and the morning briefing push. Opportunities wait until you
 * open the app — a proactive product earns its interruptions by not spending
 * them on things that can wait.
 */
type Notification = {
  key: string;
  icon: IconName;
  tone: "agent" | "alert";
  when: string;
  title: string;
  body: string;
  actions?: string[];
  /** A real alert: where tapping it goes. */
  href?: string;
  dim?: boolean;
};

const examples: Notification[] = [
  {
    key: "rain",
    icon: "signal",
    tone: "agent",
    when: "now",
    title: "Rain at 15:30 — move your hike?",
    body: "Your 16:00 Gergeti hike is inside a 12 mm window. I can put it at 11:30 and the museum in the afternoon.",
    actions: ["Apply", "Keep plan"],
  },
  {
    key: "briefing",
    icon: "signal",
    tone: "agent",
    when: "07:30",
    title: "Good morning — day 3",
    body: "Clear until mid-afternoon, roads open, one change worth making. Tap for the briefing.",
  },
  {
    key: "road",
    icon: "warning",
    tone: "alert",
    when: "yesterday",
    title: "Road closed ahead — new route ready",
    body: "Km 84 is down to one lane. I found a detour that costs 22 minutes instead of 1h 20m.",
    dim: true,
  },
];

export default async function PushPage({
  params,
}: PageProps<"/trips/[tripId]/watch/push">) {
  const { tripId } = await params;

  // The canvas trip shows the examples; a real one shows what it was sent.
  const fixture = getTrip(tripId);
  const real = fixture ? null : await loadTrip(tripId);
  const trip = fixture ?? (real?.trip as NonNullable<typeof real>["trip"]);
  const now = new Date();
  const sent: Notification[] = (real?.screen.alerts.alerts ?? [])
    .slice(0, 5)
    .map((alert) => ({
      key: alert.id,
      icon: alert.tone === "alert" ? "warning" : "signal",
      tone: alert.tone,
      when: ago(alert.sentAt, now),
      title: alert.title,
      body: alert.detail,
      actions: alert.outcome === null ? ["Open", "Later"] : undefined,
      href: `/trips/${trip.id}/alerts/${alert.id}`,
      dim: alert.outcome !== null,
    }));
  const notifications = sent.length ? sent : examples;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar active="Trips" />
      <MobileTitleBar
        back={`/trips/${trip.id}/watch`}
        title="Push notifications"
        eyebrow="How an alert reaches you"
      />

      <main className="flex flex-1 justify-center bg-backdrop px-4 py-5">
        <div className="flex w-full max-w-[390px] flex-col gap-3.5">
          <Eyebrow className="text-ink-muted">
            {sent.length
              ? "What this trip was sent"
              : real
                ? "Examples — nothing has been sent for this trip yet"
                : "How an alert reaches you"}
          </Eyebrow>

          {notifications.map((notification) => (
            <div
              key={notification.key}
              className={cx(
                "overflow-hidden rounded-[16px] border border-hairline bg-surface/92 shadow-notification",
                notification.dim && "opacity-80",
              )}
            >
              <div className="flex items-start gap-3 px-3.5 py-3">
                <span
                  className={cx(
                    "flex size-8 shrink-0 items-center justify-center rounded-control text-on-accent",
                    notification.tone === "agent" ? "bg-agent" : "bg-alert",
                  )}
                >
                  <Icon name={notification.icon} size={17} />
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-mini font-semibold">
                      trip.io
                    </span>
                    <span className="text-mini text-ink-faint">
                      {notification.when}
                    </span>
                  </div>
                  <span className="text-small font-semibold">
                    {notification.title}
                  </span>
                  <span className="text-mini text-ink-muted">
                    {notification.body}
                  </span>
                </div>
              </div>

              {notification.actions ? (
                <div className="flex border-t border-hairline">
                  {notification.actions.map((action, i) => {
                    const className = cx(
                      "flex h-10 flex-1 items-center justify-center text-small",
                      i === 0
                        ? "border-r border-hairline font-semibold text-agent"
                        : "text-ink-muted",
                    );
                    return notification.href && i === 0 ? (
                      <Link
                        key={action}
                        href={notification.href}
                        className={className}
                      >
                        {action}
                      </Link>
                    ) : (
                      <div key={action} className={className}>
                        {action}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}

          <p className="text-mini text-ink-muted">
            Only disruptions and the morning briefing push. Opportunities wait
            until you open the app.
            {real
              ? " Push reaches your phone once the trip.io app is installed and signed in; until then these arrive in the briefing and on the AI tab."
              : null}
          </p>
        </div>
      </main>
    </div>
  );
}
