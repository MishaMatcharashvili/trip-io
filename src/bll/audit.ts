import { insertAudit } from "../dal/audits.ts";
import {
  type AuditSubject,
  auditSubject,
  unauditedCandidates,
} from "../dal/metrics.ts";
import {
  AUDIT_REASONS,
  type AuditReason,
  familyOf,
  interleaveByFamily,
} from "../domain/watch/kill-criteria.ts";

// The hand audit of false positives (docs/implementation-plan.md §10): a
// queue of verdicts the router would send, marked right or wrong by a person.
// The unit of work is the verdict as it stands, so what was judged is stored
// beside the mark (src/dal/schema/ops.ts, `verdict_audit`).

export type AuditItem = {
  subject: AuditSubject;
  /** Verdicts still waiting, this one included. */
  remaining: number;
};

/**
 * The next verdict to audit, or null when the queue is empty. The order is the
 * domain's (`interleaveByFamily`): one from each family in turn, so a family
 * with three verdicts is not buried under one with three hundred.
 */
export async function nextToAudit(
  operators: readonly string[],
): Promise<AuditItem | null> {
  const queue = interleaveByFamily(await unauditedCandidates());
  // A candidate can vanish between the two reads (its trip deleted); the next
  // one is as good a sample as the one that went.
  for (const candidate of queue.slice(0, 10)) {
    const subject = await auditSubject(candidate.matchId, operators);
    if (subject) return { subject, remaining: queue.length };
  }
  return null;
}

export type AuditMark = {
  matchId: string;
  correct: boolean;
  reason?: AuditReason;
  note?: string;
  auditor: string;
};

export type AuditResult =
  | { ok: true }
  | { ok: false; reason: "gone" | "already-audited" | "needs-reason" };

export async function recordAudit(
  mark: AuditMark,
  operators: readonly string[],
): Promise<AuditResult> {
  if (!mark.correct && !mark.reason) {
    return { ok: false, reason: "needs-reason" };
  }
  if (mark.reason && !AUDIT_REASONS.includes(mark.reason)) {
    return { ok: false, reason: "needs-reason" };
  }
  const subject = await auditSubject(mark.matchId, operators);
  if (!subject) return { ok: false, reason: "gone" };

  const written = await insertAudit({
    matchId: subject.matchId,
    family: familyOf(subject.kind),
    kind: subject.kind,
    route: subject.route,
    verdict: subject.verdict,
    evidence: { event: subject.event, stop: subject.stop },
    inCohort: subject.inCohort,
    correct: mark.correct,
    // A right verdict has no reason for being wrong.
    reason: mark.correct ? null : (mark.reason ?? null),
    note: mark.note?.trim() || null,
    auditor: mark.auditor,
  });
  return written ? { ok: true } : { ok: false, reason: "already-audited" };
}
