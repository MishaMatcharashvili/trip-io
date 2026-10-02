import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// `place_external`: which place a provider knows a catalogue place as. The
// identifier and the fact that there was none are all that is kept.

export type ExternalRow =
  | { status: "matched"; externalId: string; checkedAt: Date }
  | { status: "none"; externalId: null; checkedAt: Date };

export async function findExternal(
  placeId: string,
  provider: string,
): Promise<ExternalRow | null> {
  const rows = await db.execute(sql`
    SELECT status, external_id, checked_at FROM place_external
    WHERE place_id = ${placeId} AND provider = ${provider}
  `);
  const row = rows.rows[0];
  if (!row) return null;
  const checkedAt = new Date(row.checked_at as string);
  return row.status === "matched" && typeof row.external_id === "string"
    ? { status: "matched", externalId: row.external_id, checkedAt }
    : { status: "none", externalId: null, checkedAt };
}

/** Records the answer, replacing an earlier one. */
export async function saveExternal(
  placeId: string,
  provider: string,
  answer:
    | { status: "matched"; externalId: string; confidence: number }
    | { status: "none" },
): Promise<void> {
  const externalId = answer.status === "matched" ? answer.externalId : null;
  const confidence = answer.status === "matched" ? answer.confidence : null;
  await db.execute(sql`
    INSERT INTO place_external (place_id, provider, external_id, status, confidence, checked_at)
    VALUES (${placeId}, ${provider}, ${externalId}, ${answer.status}, ${confidence}, now())
    ON CONFLICT (place_id, provider) DO UPDATE
      SET external_id = EXCLUDED.external_id,
          status = EXCLUDED.status,
          confidence = EXCLUDED.confidence,
          checked_at = now()
  `);
}
