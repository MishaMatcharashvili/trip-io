import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// `model_call`: one row per call to the model, what it used and whether it worked.

export type ModelCallRow = {
  purpose: string;
  model: string;
  tripId: string | null;
  matchId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  latencyMs: number;
  ok: boolean;
  error: string | null;
};

export async function insertModelCall(row: ModelCallRow): Promise<void> {
  await db.execute(sql`
    INSERT INTO model_call (
      purpose, model, trip_id, match_id, input_tokens, cached_input_tokens,
      output_tokens, reasoning_tokens, latency_ms, ok, error
    ) VALUES (
      ${row.purpose}, ${row.model}, ${row.tripId}, ${row.matchId},
      ${row.inputTokens}, ${row.cachedInputTokens}, ${row.outputTokens},
      ${row.reasoningTokens}, ${row.latencyMs}, ${row.ok}, ${row.error}
    )
  `);
}
