import { sql } from "drizzle-orm";
import { db } from "./client.ts";

// The operator's overview: how many of everything there is, what happened each
// day lately, and where travellers drop out. Counts only; nothing here is a
// kill criterion (those are `metrics.ts`, over the cohort) — this is the whole
// product, operators and guests included, so a quiet day is visible as one.

const int = (v: unknown): number => Number(v ?? 0);

export type Totals = {
  accounts: number;
  guests: number;
  verifiedAccounts: number;
  trips: number;
  tripsLive: number;
  tripsUpcoming: number;
  passesFree: number;
  passesPaid: number;
  revenueCents: number;
  savedPlaces: number;
  devices: number;
  events: number;
  eventsActive: number;
  articles: number;
  briefings: number;
  briefingsOpened: number;
  interventions: number;
  interventionsAccepted: number;
  regionsWithTrips: number;
};

export async function totals(): Promise<Totals> {
  const rows = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM "user" WHERE NOT COALESCE(is_anonymous, false)) AS accounts,
      (SELECT count(*) FROM "user" WHERE COALESCE(is_anonymous, false)) AS guests,
      (SELECT count(*) FROM "user"
        WHERE NOT COALESCE(is_anonymous, false) AND email_verified) AS verified,
      (SELECT count(*) FROM trip) AS trips,
      (SELECT count(*) FROM trip WHERE starts_at <= now() AND ends_at >= now()) AS live,
      (SELECT count(*) FROM trip WHERE starts_at > now()) AS upcoming,
      (SELECT count(*) FROM watch_pass WHERE kind = 'free') AS free_passes,
      (SELECT count(*) FROM watch_pass WHERE kind = 'paid') AS paid_passes,
      (SELECT COALESCE(sum(amount_cents), 0) FROM watch_pass) AS revenue,
      (SELECT count(*) FROM saved_place) AS saved,
      (SELECT count(*) FROM device WHERE disabled_at IS NULL) AS devices,
      (SELECT count(*) FROM world_event) AS events,
      (SELECT count(*) FROM world_event
        WHERE valid_from <= now() AND (valid_to IS NULL OR valid_to >= now())) AS events_active,
      (SELECT count(*) FROM source_item) AS articles,
      (SELECT count(*) FROM briefing) AS briefings,
      (SELECT count(*) FROM briefing WHERE opened_at IS NOT NULL) AS opened,
      (SELECT count(*) FROM intervention) AS interventions,
      (SELECT count(*) FROM intervention WHERE outcome = 'accepted') AS accepted,
      (SELECT count(DISTINCT r.id) FROM region r
        JOIN trip_node n ON ST_Intersects(r.geom, n.geom)) AS regions
  `);
  const r = rows.rows[0] ?? {};
  return {
    accounts: int(r.accounts),
    guests: int(r.guests),
    verifiedAccounts: int(r.verified),
    trips: int(r.trips),
    tripsLive: int(r.live),
    tripsUpcoming: int(r.upcoming),
    passesFree: int(r.free_passes),
    passesPaid: int(r.paid_passes),
    revenueCents: int(r.revenue),
    savedPlaces: int(r.saved),
    devices: int(r.devices),
    events: int(r.events),
    eventsActive: int(r.events_active),
    articles: int(r.articles),
    briefings: int(r.briefings),
    briefingsOpened: int(r.opened),
    interventions: int(r.interventions),
    interventionsAccepted: int(r.accepted),
    regionsWithTrips: int(r.regions),
  };
}

export type DailyRow = {
  /** A Tbilisi calendar date, `YYYY-MM-DD`. */
  day: string;
  accounts: number;
  guests: number;
  trips: number;
  passes: number;
  /** People who started a session that day. */
  visitors: number;
  articles: number;
  events: number;
};

/** The last `days` Tbilisi days, oldest first, a zero where nothing happened. */
export async function daily(days: number): Promise<DailyRow[]> {
  const rows = await db.execute(sql`
    WITH today AS (SELECT (now() AT TIME ZONE 'Asia/Tbilisi')::date AS d),
    days AS (
      SELECT g::date AS day
      FROM today, generate_series(today.d - (${days}::int - 1), today.d, interval '1 day') g
    ),
    local AS (
      SELECT (created_at AT TIME ZONE 'Asia/Tbilisi')::date AS day,
             NOT COALESCE(is_anonymous, false) AS account
      FROM "user"
    )
    SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM local WHERE local.day = days.day AND account) AS accounts,
      (SELECT count(*) FROM local WHERE local.day = days.day AND NOT account) AS guests,
      (SELECT count(*) FROM trip
        WHERE (created_at AT TIME ZONE 'Asia/Tbilisi')::date = days.day) AS trips,
      (SELECT count(*) FROM watch_pass
        WHERE (created_at AT TIME ZONE 'Asia/Tbilisi')::date = days.day) AS passes,
      (SELECT count(DISTINCT user_id) FROM session
        WHERE (created_at AT TIME ZONE 'Asia/Tbilisi')::date = days.day) AS visitors,
      (SELECT count(*) FROM source_item
        WHERE (fetched_at AT TIME ZONE 'Asia/Tbilisi')::date = days.day) AS articles,
      (SELECT count(*) FROM world_event
        WHERE (observed_at AT TIME ZONE 'Asia/Tbilisi')::date = days.day) AS events
    FROM days ORDER BY days.day
  `);
  return rows.rows.map((r) => ({
    day: r.day as string,
    accounts: int(r.accounts),
    guests: int(r.guests),
    trips: int(r.trips),
    passes: int(r.passes),
    visitors: int(r.visitors),
    articles: int(r.articles),
    events: int(r.events),
  }));
}

export type Funnel = {
  visitors: number;
  withTrip: number;
  accounts: number;
  accountsWithTrip: number;
  watched: number;
  paid: number;
};

/** Where people fall out between arriving and paying. Counted over people, not trips. */
export async function funnel(): Promise<Funnel> {
  const rows = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM "user") AS visitors,
      (SELECT count(DISTINCT user_id) FROM trip WHERE user_id IS NOT NULL) AS with_trip,
      (SELECT count(*) FROM "user" WHERE NOT COALESCE(is_anonymous, false)) AS accounts,
      (SELECT count(DISTINCT t.user_id) FROM trip t JOIN "user" u ON u.id = t.user_id
        WHERE NOT COALESCE(u.is_anonymous, false)) AS accounts_with_trip,
      (SELECT count(DISTINCT user_id) FROM watch_pass WHERE user_id IS NOT NULL) AS watched,
      (SELECT count(DISTINCT user_id) FROM watch_pass
        WHERE kind = 'paid' AND user_id IS NOT NULL) AS paid
  `);
  const r = rows.rows[0] ?? {};
  return {
    visitors: int(r.visitors),
    withTrip: int(r.with_trip),
    accounts: int(r.accounts),
    accountsWithTrip: int(r.accounts_with_trip),
    watched: int(r.watched),
    paid: int(r.paid),
  };
}

export type Tally = { label: string; n: number };

export type Mixes = {
  providers: Tally[];
  pace: Tally[];
  passProviders: Tally[];
  outcomes: Tally[];
  eventKinds: Tally[];
  articleStatus: Tally[];
};

const tally = (rows: Record<string, unknown>[]): Tally[] =>
  rows.map((r) => ({ label: String(r.label), n: int(r.n) }));

/** Small breakdowns for the overview, biggest first. */
export async function mixes(): Promise<Mixes> {
  const [providers, pace, passProviders, outcomes, eventKinds, articleStatus] =
    await Promise.all([
      db.execute(sql`
        SELECT provider_id AS label, count(DISTINCT user_id)::int AS n
        FROM account GROUP BY 1 ORDER BY n DESC
      `),
      db.execute(sql`
        SELECT pace AS label, count(*)::int AS n FROM trip GROUP BY 1 ORDER BY n DESC
      `),
      db.execute(sql`
        SELECT COALESCE(provider, 'none') || ' / ' || kind AS label,
               count(*)::int AS n
        FROM watch_pass GROUP BY 1 ORDER BY n DESC
      `),
      db.execute(sql`
        SELECT COALESCE(outcome::text, 'pending') AS label, count(*)::int AS n
        FROM intervention GROUP BY 1 ORDER BY n DESC
      `),
      db.execute(sql`
        SELECT kind AS label, count(*)::int AS n FROM world_event
        GROUP BY 1 ORDER BY n DESC LIMIT 12
      `),
      db.execute(sql`
        SELECT status::text AS label, count(*)::int AS n FROM source_item
        GROUP BY 1 ORDER BY n DESC
      `),
    ]);
  return {
    providers: tally(providers.rows),
    pace: tally(pace.rows),
    passProviders: tally(passProviders.rows),
    outcomes: tally(outcomes.rows),
    eventKinds: tally(eventKinds.rows),
    articleStatus: tally(articleStatus.rows),
  };
}
