import {
  attachEvent,
  distinctReporters,
  findPlace,
  publishHoursEvent,
  recordHoursReport,
} from "../dal/hours-reports.ts";
import { withTransaction } from "../dal/tx.ts";
import { dayKey } from "../domain/trip/document.ts";
import {
  checkReportDate,
  decide,
  type HoursTrust,
  hoursDedupeKey,
  hoursEventDraft,
  hoursReportInput,
} from "../domain/watch/hours.ts";
import { runMatch } from "./match.ts";

// Detector #5, end to end: a traveller says a place is shut, and when enough
// people agree it becomes a world event the matcher sees at once.

export type HoursReportResult =
  | { ok: true; status: "published" | "waiting"; reporters: number }
  | { ok: true; status: "already-reported"; reporters: number }
  | {
      ok: false;
      reason: "invalid" | "unknown-place" | "past" | "too-far-ahead";
    };

export async function submitHoursReport(
  input: unknown,
  reporter: { id: string; trust: HoursTrust },
  now: Date = new Date(),
): Promise<HoursReportResult> {
  const parsed = hoursReportInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { placeId, date } = parsed.data;

  const problem = checkReportDate(date, dayKey(now));
  if (problem === "invalid") return { ok: false, reason: "invalid" };
  if (problem) return { ok: false, reason: problem };

  const result = await withTransaction(
    async (tx): Promise<HoursReportResult> => {
      const place = await findPlace(tx, placeId);
      if (!place) return { ok: false, reason: "unknown-place" };

      const fresh = await recordHoursReport(tx, {
        placeId,
        day: date,
        reporterId: reporter.id,
        trust: reporter.trust,
        reportedAt: now.toISOString(),
      });
      const reporters = await distinctReporters(tx, placeId, date);
      if (!fresh) return { ok: true, status: "already-reported", reporters };

      if (decide(reporter.trust, reporters) === "wait") {
        return { ok: true, status: "waiting", reporters };
      }

      const draft = hoursEventDraft({
        placeId,
        placeName: place.name,
        date,
        trust: reporter.trust,
        reporters,
        reportedAt: now.toISOString(),
      });
      const eventId = await publishHoursEvent(tx, draft, {
        placeId,
        observedAt: now.toISOString(),
        dedupeKey: hoursDedupeKey(placeId, date),
      });
      if (eventId) await attachEvent(tx, placeId, date, eventId);
      return { ok: true, status: "published", reporters };
    },
  );

  if (result.ok && result.status === "published") await runMatch();
  return result;
}
