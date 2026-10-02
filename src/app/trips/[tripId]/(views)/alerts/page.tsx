import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { alertsPage } from "@/bll/interventions.ts";
import { accessTrip } from "@/bll/trip-document.ts";
import { alertHistory, getTrip, watchLedger } from "@/data/trip";
import { dayKey } from "@/domain/trip/document";
import { at } from "@/domain/watch/briefing";
import type { Outcome } from "@/domain/watch/interrupt";
import { type AlertRowView, AlertsScreen } from "@/features/alerts";
import { getAuth } from "@/infra/auth.ts";
import type { Tone } from "@/ui/cx";

export const metadata: Metadata = { title: "Everything I have told you" };

/**
 * The trust screen. Real trips list their `intervention` rows — pushes and
 * briefing items alike, each with what the traveller did about it — and the
 * fixture trip keeps the canvas's reference render for `/design`.
 */

const fixtureOutcomes = {
  accepted: { label: "Applied", tone: "agent" as const },
  dismissed: { label: "Kept plan", tone: "neutral" as const },
  ignored: { label: "No answer", tone: "neutral" as const },
  saved: { label: "Saved", tone: "neutral" as const },
  resolved: { label: "Resolved", tone: "neutral" as const },
};

const outcomeLabels: Record<Outcome | "open", { label: string; tone: Tone }> = {
  accepted: { label: "Applied", tone: "agent" },
  dismissed: { label: "Kept plan", tone: "neutral" },
  ignored: { label: "No answer", tone: "neutral" },
  muted: { label: "Muted", tone: "neutral" },
  open: { label: "Open", tone: "agent" },
};

const shortDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** "Today", "Yesterday", or the date — on Tbilisi's calendar. */
const dayLabel = (instant: string, now: Date) => {
  const day = dayKey(instant);
  if (day === dayKey(now)) return "Today";
  if (day === dayKey(now.getTime() - 86_400_000)) return "Yesterday";
  return shortDate.format(new Date(instant));
};

export default async function AlertsPage({
  params,
}: PageProps<"/trips/[tripId]/alerts">) {
  const { tripId } = await params;

  const fixture = getTrip(tripId);
  if (fixture) {
    return (
      <AlertsScreen
        view={{
          tripId: fixture.id,
          trip: fixture,
          eyebrow: `${fixture.title.split(" · ")[0]} · ${fixture.currentDay} days in`,
          stats: [
            { value: "6", label: "Told you" },
            { value: "4", label: "Applied", tone: "agent" },
            { value: "2", label: "Kept your plan" },
            { value: "4,310", label: "Checks run" },
          ],
          groups: (["Today", "Yesterday"] as const).map((label) => ({
            label,
            alerts: alertHistory
              .filter((alert) => alert.day === label)
              .map((alert) => ({
                id: alert.id,
                time: alert.time,
                title: alert.title,
                detail: alert.detail,
                tone: alert.tone,
                outcome: fixtureOutcomes[alert.outcome],
                dim: alert.outcome === "dismissed",
                urgent: alert.tone === "alert" && alert.day === "Today",
              })),
          })),
          footer: `${watchLedger[0].value} checks run · ${watchLedger[1].value} worth telling you`,
        }}
      />
    );
  }

  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) notFound();
  const access = await accessTrip(tripId, session.user.id);
  if (!access.ok) notFound();

  const page = await alertsPage(tripId);
  const now = new Date();

  const groups: { label: string; alerts: AlertRowView[] }[] = [];
  for (const alert of page.alerts) {
    const label = dayLabel(alert.sentAt, now);
    let group = groups.find((g) => g.label === label);
    if (!group) {
      group = { label, alerts: [] };
      groups.push(group);
    }
    group.alerts.push({
      id: alert.id,
      time: at(alert.sentAt),
      title: alert.title,
      detail:
        alert.channel === "briefing"
          ? `${alert.detail} · in the morning briefing`
          : alert.detail,
      tone: alert.tone,
      outcome: outcomeLabels[alert.outcome ?? "open"],
      dim: alert.outcome === "dismissed",
      urgent:
        alert.tone === "alert" &&
        alert.outcome === null &&
        alert.channel === "push" &&
        label === "Today",
    });
  }

  return (
    <AlertsScreen
      view={{
        tripId,
        eyebrow: page.title,
        stats: [
          { value: String(page.told), label: "Told you" },
          { value: String(page.applied), label: "Applied", tone: "agent" },
          { value: String(page.kept), label: "Kept your plan" },
          { value: page.checks.toLocaleString("en-GB"), label: "Checks run" },
        ],
        groups,
        footer: `${page.checks.toLocaleString("en-GB")} checks run · ${page.told} worth telling you`,
      }}
    />
  );
}
