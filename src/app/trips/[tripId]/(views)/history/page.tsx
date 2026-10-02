import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrip } from "@/data/trip";
import { RestoreButton, UndoButton } from "@/features/trip-actions";
import { ago } from "@/features/trip-model";
import { Card, Divider } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { Dot } from "@/ui/dot";
import { Num } from "@/ui/text";
import { loadTrip } from "../../load";
import { HistoryFrame } from "./frame";

export const metadata: Metadata = { title: "Change history" };

const authors = {
  system: { label: "Planner", tone: "idle" },
  user: { label: "You", tone: "ok" },
  intervention: { label: "Watch", tone: "agent" },
} as const;

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Every version of the trip, newest first. Undo and restore both append to
 * the log, so nothing here is ever lost — restoring an old version is itself
 * a version you can step back from.
 */
export default async function HistoryPage({
  params,
}: PageProps<"/trips/[tripId]/history">) {
  const { tripId } = await params;
  // The canvas trip has no log to show.
  if (getTrip(tripId)) notFound();

  const { screen, trip } = await loadTrip(tripId);
  const now = new Date();
  const [head, ...older] = screen.history;

  return (
    <HistoryFrame
      backHref={`/trips/${trip.id}/trip`}
      eyebrow={`${trip.title} · ${screen.history.length} versions`}
    >
      <Card className="overflow-hidden">
        {head ? (
          <div className="flex items-center gap-3 bg-agent-tint px-4 py-3">
            <Dot tone={authors[head.author].tone} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-small font-semibold">
                {head.intent}
              </div>
              <div className="text-mini text-ink-faint">
                {authors[head.author].label} · {ago(head.appliedAt, now)} ·
                current version
              </div>
            </div>
            {older.length ? <UndoButton tripId={trip.id} /> : null}
          </div>
        ) : null}
        {older.map((patch) => (
          <div key={patch.id}>
            <Divider />
            <div className="flex items-center gap-3 px-4 py-3">
              <Dot tone={authors[patch.author].tone} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-small font-medium">
                  {patch.intent}
                </div>
                <div className="text-mini text-ink-faint">
                  {authors[patch.author].label} ·{" "}
                  {when.format(new Date(patch.appliedAt))}
                </div>
              </div>
              <Chip size="sm">
                <Num>v{patch.seq}</Num>
              </Chip>
              <RestoreButton tripId={trip.id} patchId={patch.id} />
            </div>
          </div>
        ))}
      </Card>
    </HistoryFrame>
  );
}
