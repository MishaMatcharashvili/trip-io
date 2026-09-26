import { sql } from "drizzle-orm";
import { db, type Queryable } from "./client.ts";

// `device`: where an interrupt can reach someone. Registered by the native
// shell, read at delivery, disabled when the push service says a token is dead.

export type Platform = "ios" | "android";

/**
 * Register a token, or re-register one. A token that arrives from a different
 * user moves to them: a phone handed on must stop receiving its first owner's
 * interrupts, and re-registering is the app saying it is alive again.
 */
export async function registerDevice(
  userId: string,
  token: string,
  platform: Platform,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO device (user_id, token, platform)
    VALUES (${userId}, ${token}, ${platform}::device_platform)
    ON CONFLICT (token) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      platform = EXCLUDED.platform,
      last_seen_at = now(),
      disabled_at = NULL,
      disabled_reason = NULL
  `);
}

/** Signing a device out. Its own user only: a token is not a credential. */
export async function unregisterDevice(
  userId: string,
  token: string,
): Promise<boolean> {
  const rows = await db.execute(sql`
    UPDATE device SET disabled_at = now(), disabled_reason = 'signed-out'
    WHERE token = ${token} AND user_id = ${userId} AND disabled_at IS NULL
    RETURNING id
  `);
  return rows.rows.length > 0;
}

/** The tokens a push for this user goes to. */
export async function activeTokens(
  userId: string,
  conn: Queryable = db,
): Promise<string[]> {
  const rows = await conn.execute(sql`
    SELECT token FROM device
    WHERE user_id = ${userId} AND disabled_at IS NULL
    ORDER BY last_seen_at DESC
  `);
  return rows.rows.map((r) => r.token as string);
}

/** Tokens the push service refused for good, kept with the reason. */
export async function disableTokens(
  tokens: readonly string[],
  reason: string,
): Promise<void> {
  if (tokens.length === 0) return;
  await db.execute(sql`
    UPDATE device SET disabled_at = now(), disabled_reason = ${reason.slice(0, 200)}
    WHERE token IN (${sql.join(
      tokens.map((t) => sql`${t}`),
      sql`, `,
    )}) AND disabled_at IS NULL
  `);
}
