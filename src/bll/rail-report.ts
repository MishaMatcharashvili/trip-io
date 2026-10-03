import { endRailEvents, publishRailEvent } from "../dal/rail-reports.ts";
import { withTransaction } from "../dal/tx.ts";
import type { RailKind } from "../domain/watch/event.ts";
import {
  describeRail,
  railDedupeKey,
  railEventDraft,
  railReportInput,
} from "../domain/watch/rail.ts";
import { runMatch } from "./match.ts";

// Detector #6, end to end: an operator says what the railway is doing, and the
// matcher sees it at once. Operators only — callers decide who is one.

export type RailReportResult =
  | { ok: true; description: string; published: boolean; ended: number }
  | { ok: false; reason: "invalid" };

export async function submitRailReport(
  input: unknown,
  now: Date = new Date(),
): Promise<RailReportResult> {
  const parsed = railReportInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const report = parsed.data;
  const draft = railEventDraft(report, now);

  const result = await withTransaction(async (tx) => {
    // The newest report about a line is the truth about it, so whatever was
    // open on it ends first; "running normally" is only this.
    const ended = await endRailEvents(tx, report.route, now.toISOString());
    if (!draft) return { ended, published: false };
    const eventId = await publishRailEvent(tx, draft, {
      route: report.route,
      observedAt: now.toISOString(),
      dedupeKey: railDedupeKey(
        draft.kind as RailKind,
        report.route,
        draft.validFrom,
      ),
    });
    return { ended, published: eventId !== null };
  });

  if (result.published) await runMatch();
  return { ok: true, description: describeRail(report), ...result };
}
