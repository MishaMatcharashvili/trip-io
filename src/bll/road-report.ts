import {
  decideReport,
  endRoadEvents,
  insertReport,
  lockReport,
  pendingCount,
  pendingReports,
  publishRoadEvent,
  type StoredReport,
} from "../dal/road-reports.ts";
import { type Tx, withTransaction } from "../dal/tx.ts";
import { dedupeKey } from "../domain/watch/event.ts";
import {
  describeStored,
  MAX_PENDING_PER_REPORTER,
  onApproval,
  type ReportTrust,
  type RoadReportInput,
  reportWindow,
  roadEventDraft,
  roadReportInput,
} from "../domain/watch/road.ts";
import { runMatch } from "./match.ts";

// Detector #2, end to end: a report arrives, is published or held for review,
// and a published one becomes a world event the matcher sees at once.
//
// Nothing here knows about Telegram. The bot (src/server/telegram) is one way
// in; the order things happen in, and the transaction they happen in, is this
// file's.

export type Reporter = {
  /** The reporter's id in the channel they reported from. */
  id: string;
  name: string;
  /** Where to tell them what happened to the report. */
  chatId: string;
};

export type Published = {
  status: "published" | "expired";
  reportId: string;
  eventId: string | null;
  /** Earlier road events on the corridor this report closed. */
  ended: number;
};

export type SubmitResult =
  | ({ ok: true } & Published)
  | { ok: true; status: "pending"; reportId: string }
  | {
      ok: false;
      reason: "invalid" | "unknown-corridor" | "too-many-pending";
    };

/**
 * A report, from anyone. An operator's is published in the same transaction it
 * is recorded in; anyone else's is recorded as `pending` for review — unless
 * they already have enough waiting, which is what keeps one stranger from
 * burying the queue.
 */
export async function submitRoadReport(
  input: unknown,
  reporter: Reporter,
  trust: ReportTrust,
  now: Date = new Date(),
): Promise<SubmitResult> {
  const parsed = roadReportInput.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const report = parsed.data;

  if (
    trust === "community" &&
    (await pendingCount(reporter.id)) >= MAX_PENDING_PER_REPORTER
  ) {
    return { ok: false, reason: "too-many-pending" };
  }

  const window = reportWindow(report.duration, now);
  const result = await withTransaction(async (tx): Promise<SubmitResult> => {
    const reportId = await insertReport(tx, {
      corridorSlug: report.corridorSlug,
      condition: report.condition,
      hazard: report.hazard,
      ...window,
      reportedAt: now.toISOString(),
      reporterId: reporter.id,
      reporterName: reporter.name,
      chatId: reporter.chatId,
    });
    if (!reportId) return { ok: false, reason: "unknown-corridor" };
    if (trust === "community") return { ok: true, status: "pending", reportId };

    const published = await publish(tx, {
      reportId,
      report,
      window,
      reportedAt: now.toISOString(),
      trust,
      reviewer: reporter.id,
      now,
    });
    return { ok: true, ...published };
  });

  if (result.ok && result.status === "published") await runMatch();
  return result;
}

export type ModerateResult =
  | ({ ok: true; report: StoredReport; description: string } & (
      | Published
      | { status: "rejected"; reportId: string }
    ))
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "already-decided"; status: StoredReport["status"] };

/**
 * An operator's verdict on a stranger's report. Approval publishes it at the
 * community's confidence — or records it `expired` if its window closed while
 * it waited. Either way the reporter is told, by the caller, from what this
 * returns.
 */
export async function moderateReport(
  reportId: string,
  operatorId: string,
  decision: "approve" | "reject",
  now: Date = new Date(),
): Promise<ModerateResult> {
  const result = await withTransaction(async (tx): Promise<ModerateResult> => {
    const stored = await lockReport(tx, reportId);
    if (!stored) return { ok: false, reason: "not-found" };
    if (stored.status !== "pending") {
      return { ok: false, reason: "already-decided", status: stored.status };
    }

    const report: RoadReportInput = {
      corridorSlug: stored.corridorSlug,
      condition: stored.condition,
      hazard: stored.hazard,
      // Not used past this point: the window was fixed when it was sent.
      duration: "unknown",
    };
    const description = describeStored(stored);

    if (decision === "reject") {
      await decideReport(tx, reportId, {
        status: "rejected",
        reviewedBy: operatorId,
      });
      return {
        ok: true,
        status: "rejected",
        reportId,
        report: stored,
        description,
      };
    }

    const published = await publish(tx, {
      reportId,
      report,
      window: { validFrom: stored.validFrom, validTo: stored.validTo },
      reportedAt: stored.reportedAt,
      trust: "community",
      reviewer: operatorId,
      now,
    });
    return { ok: true, ...published, report: stored, description };
  });

  if (result.ok && result.status === "published") await runMatch();
  return result;
}

/** What an operator has waiting. */
export async function reviewQueue(): Promise<
  (StoredReport & { description: string })[]
> {
  return (await pendingReports()).map((r) => ({
    ...r,
    description: describeStored(r),
  }));
}

/**
 * Publish inside the caller's transaction. The newest report about a road is
 * the truth about it, so whatever was open on the corridor ends first; then
 * the new event is written, unless the report is a reopening — which writes
 * none, and whose whole effect is the ending.
 */
async function publish(
  tx: Tx,
  input: {
    reportId: string;
    report: RoadReportInput;
    window: { validFrom: string; validTo: string };
    reportedAt: string;
    trust: ReportTrust;
    reviewer: string;
    now: Date;
  },
): Promise<Published> {
  const { reportId, report, window, now } = input;

  if (onApproval(window, now) === "expired") {
    await decideReport(tx, reportId, {
      status: "expired",
      reviewedBy: input.reviewer,
    });
    return { status: "expired", reportId, eventId: null, ended: 0 };
  }

  const ended = await endRoadEvents(tx, report.corridorSlug, now.toISOString());

  const draft = roadEventDraft({
    report,
    trust: input.trust,
    window,
    reportedAt: input.reportedAt,
  });
  const eventId = draft
    ? await publishRoadEvent(tx, draft, {
        corridorSlug: report.corridorSlug,
        observedAt: now.toISOString(),
        dedupeKey: dedupeKey(draft, report.corridorSlug),
      })
    : null;

  await decideReport(tx, reportId, {
    status: "published",
    reviewedBy: input.reviewer,
    eventId,
  });
  return { status: "published", reportId, eventId, ended };
}
