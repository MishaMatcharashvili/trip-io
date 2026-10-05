import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// `verdict_audit`: a person's judgement of one verdict the router would send.

export type AuditRow = {
  matchId: string;
  family: string;
  kind: string;
  route: string;
  verdict: unknown;
  evidence: unknown;
  inCohort: boolean;
  correct: boolean;
  reason: string | null;
  note: string | null;
  auditor: string;
};

/** False when the verdict had already been audited: it is audited once. */
export async function insertAudit(row: AuditRow): Promise<boolean> {
  const rows = await db.execute(sql`
    INSERT INTO verdict_audit (
      match_id, family, kind, route, verdict, evidence, in_cohort,
      correct, reason, note, auditor
    ) VALUES (
      ${row.matchId}, ${row.family}, ${row.kind}, ${row.route},
      ${JSON.stringify(row.verdict)}::jsonb, ${JSON.stringify(row.evidence)}::jsonb,
      ${row.inCohort}, ${row.correct}, ${row.reason}, ${row.note}, ${row.auditor}
    )
    ON CONFLICT (match_id) DO NOTHING
    RETURNING id
  `);
  return rows.rows.length > 0;
}
