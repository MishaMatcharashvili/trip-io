import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// What the operator's panel reads about people and their trips, and nothing it
// writes (src/app/admin). Like `metrics.ts` this is a reporting repository: the
// shapes are flat rows built for a table, not aggregates.
//
// Every list is capped at the newest rows. The panel sorts and filters in the
// browser, so the cap is what keeps a page's payload bounded; the reader is
// told when it bites (`total` beside `rows`).

export const PEOPLE_LIMIT = 5_000;
export const TRIPS_LIMIT = 2_000;

const int = (v: unknown): number => Number(v ?? 0);
const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : new Date(v as string).toISOString();

export type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  isAnonymous: boolean;
  providers: string[];
  joinedAt: string;
  lastActiveAt: string | null;
  sessions: number;
  trips: number;
  watchedTrips: number;
  paidCents: number;
  savedPlaces: number;
  devices: number;
  alerts: number;
  alertsAccepted: number;
  lastTripAt: string | null;
};

export async function listUsers(): Promise<{ rows: UserRow[]; total: number }> {
  const [rows, total] = await Promise.all([
    db.execute(sql`
      WITH sess AS (
        SELECT user_id, count(*)::int AS n, max(updated_at) AS last_at
        FROM session GROUP BY user_id
      ),
      prov AS (
        SELECT user_id, array_agg(DISTINCT provider_id) AS ids
        FROM account GROUP BY user_id
      ),
      tr AS (
        SELECT user_id, count(*)::int AS n, max(created_at) AS last_at
        FROM trip WHERE user_id IS NOT NULL GROUP BY user_id
      ),
      pass AS (
        SELECT user_id, count(*)::int AS n,
               COALESCE(sum(amount_cents), 0)::int AS cents
        FROM watch_pass WHERE user_id IS NOT NULL GROUP BY user_id
      ),
      sv AS (SELECT user_id, count(*)::int AS n FROM saved_place GROUP BY user_id),
      dev AS (
        SELECT user_id, count(*)::int AS n FROM device
        WHERE disabled_at IS NULL GROUP BY user_id
      ),
      iv AS (
        SELECT t.user_id, count(*)::int AS n,
               count(*) FILTER (WHERE i.outcome = 'accepted')::int AS accepted
        FROM intervention i JOIN trip t ON t.id = i.trip_id
        WHERE t.user_id IS NOT NULL GROUP BY t.user_id
      )
      SELECT u.id, u.name, u.email, u.email_verified, u.is_anonymous,
             u.created_at,
             COALESCE(prov.ids, ARRAY[]::text[]) AS providers,
             sess.last_at AS last_active_at, COALESCE(sess.n, 0) AS sessions,
             COALESCE(tr.n, 0) AS trips, tr.last_at AS last_trip_at,
             COALESCE(pass.n, 0) AS watched, COALESCE(pass.cents, 0) AS paid_cents,
             COALESCE(sv.n, 0) AS saved, COALESCE(dev.n, 0) AS devices,
             COALESCE(iv.n, 0) AS alerts, COALESCE(iv.accepted, 0) AS accepted
      FROM "user" u
      LEFT JOIN sess ON sess.user_id = u.id
      LEFT JOIN prov ON prov.user_id = u.id
      LEFT JOIN tr ON tr.user_id = u.id
      LEFT JOIN pass ON pass.user_id = u.id
      LEFT JOIN sv ON sv.user_id = u.id
      LEFT JOIN dev ON dev.user_id = u.id
      LEFT JOIN iv ON iv.user_id = u.id
      ORDER BY u.created_at DESC
      LIMIT ${PEOPLE_LIMIT}
    `),
    db.execute(sql`SELECT count(*)::int AS n FROM "user"`),
  ]);
  return {
    total: int(total.rows[0]?.n),
    rows: rows.rows.map((r) => ({
      id: r.id as string,
      name: r.name as string,
      email: r.email as string,
      emailVerified: r.email_verified as boolean,
      isAnonymous: Boolean(r.is_anonymous),
      providers: r.providers as string[],
      joinedAt: iso(r.created_at) as string,
      lastActiveAt: iso(r.last_active_at),
      sessions: int(r.sessions),
      trips: int(r.trips),
      watchedTrips: int(r.watched),
      paidCents: int(r.paid_cents),
      savedPlaces: int(r.saved),
      devices: int(r.devices),
      alerts: int(r.alerts),
      alertsAccepted: int(r.accepted),
      lastTripAt: iso(r.last_trip_at),
    })),
  };
}

export type UserSession = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type UserDevice = {
  id: string;
  platform: string;
  createdAt: string;
  lastSeenAt: string;
  disabledAt: string | null;
  disabledReason: string | null;
};

/** One person's sessions and devices. The session token is never selected. */
export async function userActivity(
  userId: string,
): Promise<{ sessions: UserSession[]; devices: UserDevice[] }> {
  const [sessions, devices] = await Promise.all([
    db.execute(sql`
      SELECT id, created_at, updated_at, expires_at, ip_address, user_agent
      FROM session WHERE user_id = ${userId}
      ORDER BY updated_at DESC LIMIT 50
    `),
    db.execute(sql`
      SELECT id, platform, created_at, last_seen_at, disabled_at, disabled_reason
      FROM device WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT 50
    `),
  ]);
  return {
    sessions: sessions.rows.map((r) => ({
      id: r.id as string,
      createdAt: iso(r.created_at) as string,
      lastSeenAt: iso(r.updated_at) as string,
      expiresAt: iso(r.expires_at) as string,
      ipAddress: (r.ip_address as string | null) ?? null,
      userAgent: (r.user_agent as string | null) ?? null,
    })),
    devices: devices.rows.map((r) => ({
      id: r.id as string,
      platform: r.platform as string,
      createdAt: iso(r.created_at) as string,
      lastSeenAt: iso(r.last_seen_at) as string,
      disabledAt: iso(r.disabled_at),
      disabledReason: (r.disabled_reason as string | null) ?? null,
    })),
  };
}

export type TripRow = {
  id: string;
  title: string;
  ownerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerIsAnonymous: boolean;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  travellers: number;
  pace: string;
  budget: string;
  regions: string[];
  stops: number;
  edits: number;
  passKind: "free" | "paid" | null;
  paidCents: number;
  currency: string | null;
  muted: boolean;
  alerts: number;
  alertsAccepted: number;
  briefings: number;
  briefingsOpened: number;
};

/**
 * Trips with who owns them and what the watch did for them, newest first.
 * `userId` narrows to one person; without it, everyone's.
 */
export async function listTrips(
  userId?: string,
): Promise<{ rows: TripRow[]; total: number }> {
  const scope = userId ? sql`WHERE t.user_id = ${userId}` : sql``;
  const [rows, total] = await Promise.all([
    db.execute(sql`
      SELECT t.id, t.title, t.user_id, u.name AS owner_name,
             u.email AS owner_email, u.is_anonymous AS owner_anon,
             t.starts_at, t.ends_at, t.created_at, t.pace, t.budget,
             COALESCE((t.party->>'adults')::int, 1)
               + COALESCE((t.party->>'children')::int, 0) AS travellers,
             COALESCE(reg.names, ARRAY[]::text[]) AS regions,
             (SELECT count(*)::int FROM trip_node n WHERE n.trip_id = t.id) AS stops,
             (SELECT count(*)::int FROM trip_patch p
               WHERE p.trip_id = t.id AND p.author = 'user') AS edits,
             wp.kind AS pass_kind, wp.amount_cents, wp.currency,
             (w.muted_at IS NOT NULL) AS muted,
             (SELECT count(*)::int FROM intervention i WHERE i.trip_id = t.id) AS alerts,
             (SELECT count(*)::int FROM intervention i
               WHERE i.trip_id = t.id AND i.outcome = 'accepted') AS accepted,
             (SELECT count(*)::int FROM briefing b WHERE b.trip_id = t.id) AS briefings,
             (SELECT count(*)::int FROM briefing b
               WHERE b.trip_id = t.id AND b.opened_at IS NOT NULL) AS opened
      FROM trip t
      LEFT JOIN "user" u ON u.id = t.user_id
      LEFT JOIN watch_pass wp ON wp.trip_id = t.id
      LEFT JOIN trip_watch w ON w.trip_id = t.id
      LEFT JOIN LATERAL (
        SELECT array_agg(DISTINCT r.name ORDER BY r.name) AS names
        FROM trip_node n JOIN region r ON ST_Intersects(r.geom, n.geom)
        WHERE n.trip_id = t.id
      ) reg ON true
      ${scope}
      ORDER BY t.created_at DESC
      LIMIT ${TRIPS_LIMIT}
    `),
    db.execute(
      userId
        ? sql`SELECT count(*)::int AS n FROM trip WHERE user_id = ${userId}`
        : sql`SELECT count(*)::int AS n FROM trip`,
    ),
  ]);
  return {
    total: int(total.rows[0]?.n),
    rows: rows.rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      ownerId: (r.user_id as string | null) ?? null,
      ownerName: (r.owner_name as string | null) ?? null,
      ownerEmail: (r.owner_email as string | null) ?? null,
      ownerIsAnonymous: Boolean(r.owner_anon),
      startsAt: iso(r.starts_at) as string,
      endsAt: iso(r.ends_at) as string,
      createdAt: iso(r.created_at) as string,
      travellers: int(r.travellers),
      pace: r.pace as string,
      budget: r.budget as string,
      regions: r.regions as string[],
      stops: int(r.stops),
      edits: int(r.edits),
      passKind: (r.pass_kind as TripRow["passKind"]) ?? null,
      paidCents: int(r.amount_cents),
      currency: (r.currency as string | null) ?? null,
      muted: Boolean(r.muted),
      alerts: int(r.alerts),
      alertsAccepted: int(r.accepted),
      briefings: int(r.briefings),
      briefingsOpened: int(r.opened),
    })),
  };
}
