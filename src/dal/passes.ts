import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// `watch_pass`: which trips are watched, and on what terms.

export type PassRow = {
  tripId: string;
  kind: "free" | "paid";
  amountCents: number;
  currency: string;
  provider: string | null;
  createdAt: string;
};

export async function passFor(tripId: string): Promise<PassRow | null> {
  const rows = await db.execute(sql`
    SELECT trip_id, kind, amount_cents, currency, provider, created_at
    FROM watch_pass WHERE trip_id = ${tripId}
  `);
  const r = rows.rows[0];
  return r
    ? {
        tripId: r.trip_id as string,
        kind: r.kind as PassRow["kind"],
        amountCents: r.amount_cents as number,
        currency: r.currency as string,
        provider: (r.provider as string | null) ?? null,
        createdAt: new Date(r.created_at as string).toISOString(),
      }
    : null;
}

/** Every pass a traveller holds, newest first. */
export async function passesOf(userId: string): Promise<PassRow[]> {
  const rows = await db.execute(sql`
    SELECT trip_id, kind, amount_cents, currency, provider, created_at
    FROM watch_pass WHERE user_id = ${userId} ORDER BY created_at DESC
  `);
  return rows.rows.map((r) => ({
    tripId: r.trip_id as string,
    kind: r.kind as PassRow["kind"],
    amountCents: r.amount_cents as number,
    currency: r.currency as string,
    provider: (r.provider as string | null) ?? null,
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

/** Grant a pass. False when the trip already had one: a pass is never bought twice. */
export async function insertPass(pass: {
  tripId: string;
  userId: string | null;
  kind: "free" | "paid";
  amountCents: number;
  currency: string;
  provider: string | null;
  providerRef?: string | null;
}): Promise<boolean> {
  const rows = await db.execute(sql`
    INSERT INTO watch_pass
      (trip_id, user_id, kind, amount_cents, currency, provider, provider_ref)
    VALUES (${pass.tripId}, ${pass.userId}, ${pass.kind}, ${pass.amountCents},
            ${pass.currency}, ${pass.provider}, ${pass.providerRef ?? null})
    ON CONFLICT (trip_id) DO NOTHING
    RETURNING trip_id
  `);
  return rows.rows.length > 0;
}

/**
 * The pipeline's gate, as SQL over a `trip_watch w`: only a trip holding a
 * pass is sensed, matched or briefed. Planning is free; watching is not.
 */
export const passHeld = sql`EXISTS (SELECT 1 FROM watch_pass wp WHERE wp.trip_id = w.trip_id)`;
