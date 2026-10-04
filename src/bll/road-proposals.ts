import { db } from "../dal/client.ts";
import { enqueue } from "../dal/jobs.ts";
import { insertReport, unnotifiedProposals } from "../dal/road-reports.ts";
import { loadItem, markItem, storeItems } from "../dal/source-items.ts";
import { describeStored } from "../domain/watch/road.ts";
import {
  NOTICE_REPORTER_NAME,
  type NoticeStatus,
  noticeReporterId,
  noticeText,
  noticeUrl,
  proposalFor,
  type RoadNotice,
  vetRoadClaim,
} from "../domain/watch/road-notice.ts";
import { fetchNotices } from "../infra/georoad.ts";
import { readRoadNotice } from "../infra/openai-road.ts";

// Road automation, the way the spike said to do it: assisted. The Roads
// Department's own notices are read by a model, each one that lands on a
// corridor becomes a pending road report, and an operator approves it in the
// same Telegram queue a person's report goes to. The model removes the typing;
// it does not remove the check. (context/phase-8-design.md has the numbers.)

export const ROAD_NOTICE_JOB = "road-notice";
export const NOTICE_SOURCE = "georoad";

export type SenseRoadsReport = { fetched: number; queued: number };

/** Fetch the newest page and queue a read of each notice not seen before. */
export async function senseRoadNotices(
  deps: { fetch?: (pages: number) => Promise<RoadNotice[]> } = {},
): Promise<SenseRoadsReport> {
  const notices = await (deps.fetch ?? fetchNotices)(1);
  const byUrl = new Map(notices.map((n) => [noticeUrl(n), n]));
  const ids = await storeItems(
    NOTICE_SOURCE,
    "ka",
    notices.map((n) => ({
      url: noticeUrl(n),
      text: noticeText(n),
      publishedAt: n.publishedAt,
    })),
  );
  for (const itemId of ids) {
    const item = await loadItem(itemId);
    const notice = item ? byUrl.get(item.url) : undefined;
    if (!notice) continue;
    // The department's status is not in the stored text; it travels with the job.
    await enqueue(ROAD_NOTICE_JOB, {
      itemId,
      noticeId: notice.id,
      status: notice.status,
      publishedAt: notice.publishedAt,
    });
  }
  return { fetched: notices.length, queued: ids.length };
}

export type ProposeDeps = {
  read?: typeof readRoadNotice;
  now?: () => Date;
};

export type ProposeResult =
  | { proposed: true; reportId: string }
  | { proposed: false; reason: string };

/** The job: read one notice, and if it lands on a corridor, propose it. */
export async function proposeFromNotice(
  payload: {
    itemId: string;
    noticeId: number;
    status: NoticeStatus;
    publishedAt: string;
  },
  deps: ProposeDeps = {},
): Promise<ProposeResult> {
  const item = await loadItem(payload.itemId);
  if (!item) return { proposed: false, reason: "missing" };
  if (item.status !== "new") return { proposed: false, reason: "already-read" };

  const raw = await (deps.read ?? readRoadNotice)({
    text: item.originalText,
    status: payload.status,
    publishedAt: payload.publishedAt,
  });
  const vetted = vetRoadClaim(raw, {
    text: item.originalText,
    status: payload.status,
  });

  const record = (
    status: "empty" | "rejected" | "published",
    reason: string | null,
  ) =>
    markItem(payload.itemId, {
      status,
      reason,
      // Georgian; the English of a notice is the proposal's own description.
      english: item.originalText,
      extraction: [raw],
    });

  if (!vetted.ok) {
    await record("rejected", vetted.reason);
    return { proposed: false, reason: vetted.reason };
  }
  const proposal = proposalFor(vetted.claim, payload);
  if (!proposal) {
    await record("empty", "not-on-a-corridor");
    return { proposed: false, reason: "not-on-a-corridor" };
  }

  const reportId = await insertReport(db, {
    corridorSlug: proposal.corridorSlug,
    condition:
      proposal.condition === "reopened" ? "reopened" : proposal.condition,
    hazard: null,
    validFrom: proposal.validFrom,
    validTo: proposal.validTo,
    reportedAt: (deps.now?.() ?? new Date()).toISOString(),
    reporterId: noticeReporterId({ id: payload.noticeId }),
    reporterName: NOTICE_REPORTER_NAME,
    // There is no chat to answer: the outcome of a proposal is the event.
    chatId: "none",
  });
  if (!reportId) {
    await record("rejected", "unknown-corridor");
    return { proposed: false, reason: "unknown-corridor" };
  }
  await record("published", null);
  return { proposed: true, reportId };
}

export type Waiting = { id: string; description: string };

/** What the operators have not been told about, described for the message. */
export async function proposalsToAnnounce(): Promise<Waiting[]> {
  return (await unnotifiedProposals()).map((r) => ({
    id: r.id,
    description: describeStored(r),
  }));
}
