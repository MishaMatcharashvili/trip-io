import { daily, funnel, mixes, totals } from "../dal/admin-analytics.ts";
import {
  type ArticleRow,
  articleSources,
  type EventRow,
  eventSources,
  listArticles,
  listEvents,
  regionSummaries,
} from "../dal/admin-feed.ts";
import {
  listTrips,
  listUsers,
  type TripRow,
  type UserRow,
  userActivity,
} from "../dal/admin-people.ts";
import {
  CHANNEL_LABELS,
  channelOfEvent,
  eventSummary,
  liveness,
  outletNames,
  sourceLabel,
} from "../domain/admin/feed.ts";
import {
  centsToAmount,
  signInMethods,
  tripDays,
  tripPhase,
  userKind,
} from "../domain/admin/people.ts";
import type { ColumnSpec, Row, Table } from "../domain/admin/table.ts";

// What the operator's panel (src/app/admin) shows. Each function reads a
// repository and returns a `Table`: columns as data, rows as flat cells, so the
// page can hand it to the browser to sort and filter. Nothing here writes.

export async function overview() {
  const [t, byDay, f, m] = await Promise.all([
    totals(),
    daily(30),
    funnel(),
    mixes(),
  ]);
  return { totals: t, daily: byDay, funnel: f, mixes: m };
}

const USER_COLUMNS: ColumnSpec[] = [
  { key: "name", kind: "text", label: "Name", link: "href" },
  { key: "email", kind: "text", label: "Email" },
  { key: "type", kind: "choice", label: "Type" },
  { key: "verified", kind: "choice", label: "Verified", format: "yesno" },
  { key: "signIn", kind: "choice", label: "Signs in with" },
  { key: "joined", kind: "date", label: "Joined", format: "date" },
  { key: "lastActive", kind: "date", label: "Last active", format: "date" },
  { key: "sessions", kind: "number", label: "Sessions", format: "number" },
  { key: "trips", kind: "number", label: "Trips", format: "number" },
  { key: "lastTrip", kind: "date", label: "Last trip", format: "date" },
  { key: "watched", kind: "number", label: "Watched", format: "number" },
  { key: "paid", kind: "number", label: "Paid", format: "amount" },
  { key: "saved", kind: "number", label: "Saved places", format: "number" },
  { key: "devices", kind: "number", label: "Devices", format: "number" },
  { key: "alerts", kind: "number", label: "Alerts", format: "number" },
  { key: "accepted", kind: "number", label: "Accepted", format: "number" },
];

const userRow = (u: UserRow): Row => ({
  href: `/admin/users/${u.id}`,
  name: u.name || (u.isAnonymous ? "Guest" : u.email),
  // A guest's address is a placeholder Better Auth made up, not a contact.
  email: u.isAnonymous ? null : u.email,
  type: userKind(u.isAnonymous),
  verified: u.isAnonymous ? null : u.emailVerified,
  signIn: u.isAnonymous ? null : signInMethods(u.providers) || null,
  joined: u.joinedAt,
  lastActive: u.lastActiveAt,
  sessions: u.sessions,
  trips: u.trips,
  lastTrip: u.lastTripAt,
  watched: u.watchedTrips,
  paid: centsToAmount(u.paidCents),
  saved: u.savedPlaces,
  devices: u.devices,
  alerts: u.alerts,
  accepted: u.alertsAccepted,
});

export async function userTable(): Promise<Table> {
  const { rows, total } = await listUsers();
  return { columns: USER_COLUMNS, rows: rows.map(userRow), total };
}

const TRIP_COLUMNS: ColumnSpec[] = [
  { key: "title", kind: "text", label: "Trip", link: "href" },
  { key: "owner", kind: "text", label: "Traveller", link: "ownerHref" },
  { key: "ownerEmail", kind: "text", label: "Email" },
  { key: "ownerType", kind: "choice", label: "Type" },
  { key: "phase", kind: "choice", label: "When" },
  { key: "starts", kind: "date", label: "Starts", format: "date" },
  { key: "ends", kind: "date", label: "Ends", format: "date" },
  { key: "days", kind: "number", label: "Days", format: "number" },
  { key: "travellers", kind: "number", label: "Party", format: "number" },
  { key: "pace", kind: "choice", label: "Pace" },
  { key: "budget", kind: "choice", label: "Budget" },
  { key: "regions", kind: "text", label: "Regions" },
  { key: "stops", kind: "number", label: "Stops", format: "number" },
  { key: "edits", kind: "number", label: "Edits", format: "number" },
  { key: "pass", kind: "choice", label: "Watch pass" },
  { key: "paid", kind: "number", label: "Paid", format: "amount" },
  { key: "muted", kind: "choice", label: "Muted", format: "yesno" },
  { key: "alerts", kind: "number", label: "Alerts", format: "number" },
  { key: "accepted", kind: "number", label: "Accepted", format: "number" },
  { key: "briefings", kind: "number", label: "Briefings", format: "number" },
  { key: "opened", kind: "number", label: "Opened", format: "number" },
  { key: "created", kind: "date", label: "Created", format: "date" },
];

const tripRow = (t: TripRow, now: Date): Row => ({
  href: `/trips/${t.id}`,
  ownerHref: t.ownerId ? `/admin/users/${t.ownerId}` : null,
  title: t.title,
  owner: t.ownerId ? t.ownerName || t.ownerEmail || "Guest" : "Nobody yet",
  ownerEmail: t.ownerIsAnonymous ? null : t.ownerEmail,
  ownerType: t.ownerId ? userKind(t.ownerIsAnonymous) : null,
  phase: tripPhase(t.startsAt, t.endsAt, now),
  starts: t.startsAt,
  ends: t.endsAt,
  days: tripDays(t.startsAt, t.endsAt),
  travellers: t.travellers,
  pace: t.pace,
  budget: t.budget,
  regions: t.regions.join(", "),
  stops: t.stops,
  edits: t.edits,
  pass: t.passKind ?? "none",
  paid: centsToAmount(t.paidCents),
  muted: t.passKind ? t.muted : null,
  alerts: t.alerts,
  accepted: t.alertsAccepted,
  briefings: t.briefings,
  opened: t.briefingsOpened,
  created: t.createdAt,
});

export async function tripTable(userId?: string): Promise<Table> {
  const { rows, total } = await listTrips(userId);
  const now = new Date();
  return {
    columns: TRIP_COLUMNS,
    rows: rows.map((t) => tripRow(t, now)),
    total,
  };
}

/** One person: their row, their trips, and the sessions and devices behind them. */
export async function userDetail(userId: string) {
  const { rows } = await listUsers();
  const user = rows.find((u) => u.id === userId);
  if (!user) return null;
  const [activity, trips] = await Promise.all([
    userActivity(userId),
    tripTable(userId),
  ]);
  return { user, ...activity, trips };
}

const ARTICLE_COLUMNS: ColumnSpec[] = [
  { key: "fetched", kind: "date", label: "Fetched", format: "date" },
  { key: "published", kind: "date", label: "Published", format: "date" },
  { key: "source", kind: "choice", label: "Source" },
  { key: "headline", kind: "text", label: "Headline", link: "url", wide: true },
  { key: "status", kind: "choice", label: "Status" },
  { key: "reason", kind: "text", label: "Why" },
  { key: "language", kind: "choice", label: "Language" },
  { key: "claims", kind: "number", label: "Claims", format: "number" },
  { key: "regions", kind: "text", label: "Regions" },
  { key: "kinds", kind: "text", label: "Event kinds" },
  { key: "english", kind: "text", label: "English", detail: true },
  { key: "original", kind: "text", label: "As printed", detail: true },
];

const articleRow = (a: ArticleRow): Row => ({
  url: a.url,
  fetched: a.fetchedAt,
  published: a.publishedAt,
  source: sourceLabel(a.source),
  headline: a.headline,
  status: a.status,
  reason: a.reason,
  language: a.language,
  claims: a.claims,
  regions: a.regions.join(", "),
  kinds: a.kinds.join(", "),
  english: a.english,
  original: a.original,
});

export async function articleTable(): Promise<Table> {
  const { rows, total } = await listArticles();
  return { columns: ARTICLE_COLUMNS, rows: rows.map(articleRow), total };
}

const EVENT_COLUMNS: ColumnSpec[] = [
  { key: "observed", kind: "date", label: "Observed", format: "date" },
  { key: "channel", kind: "choice", label: "Channel" },
  { key: "source", kind: "choice", label: "Source" },
  { key: "kind", kind: "choice", label: "Kind" },
  { key: "severity", kind: "choice", label: "Severity" },
  { key: "region", kind: "text", label: "Region" },
  { key: "summary", kind: "text", label: "What it says", wide: true },
  { key: "state", kind: "choice", label: "State" },
  { key: "from", kind: "date", label: "Valid from", format: "date" },
  { key: "to", kind: "date", label: "Valid to", format: "date" },
  { key: "confidence", kind: "number", label: "Confidence", format: "number" },
  { key: "outlets", kind: "text", label: "Reported by" },
  { key: "matches", kind: "number", label: "Matches", format: "number" },
  { key: "trips", kind: "number", label: "Trips", format: "number" },
  { key: "worth", kind: "number", label: "Worth telling", format: "number" },
];

const eventRow = (e: EventRow, now: Date): Row => ({
  observed: e.observedAt,
  channel: CHANNEL_LABELS[channelOfEvent(e.kind)],
  source: sourceLabel(e.source),
  kind: e.kind,
  severity: e.severity,
  region: e.regionName,
  summary: eventSummary(e.kind, e.payload),
  state: liveness(e.validFrom, e.validTo, now),
  from: e.validFrom,
  to: e.validTo,
  confidence: Math.round(e.confidence * 100) / 100,
  outlets: outletNames(e.payload).join(", ") || null,
  matches: e.matches,
  trips: e.trips,
  worth: e.worth,
});

export async function eventTable(): Promise<Table> {
  const { rows, total } = await listEvents();
  const now = new Date();
  return {
    columns: EVENT_COLUMNS,
    rows: rows.map((e) => eventRow(e, now)),
    total,
  };
}

const SOURCE_COLUMNS: ColumnSpec[] = [
  { key: "source", kind: "text", label: "Source" },
  { key: "feed", kind: "choice", label: "Feed" },
  { key: "total", kind: "number", label: "Items", format: "number" },
  { key: "last24h", kind: "number", label: "Last 24 h", format: "number" },
  { key: "lastAt", kind: "date", label: "Latest", format: "date" },
  { key: "published", kind: "number", label: "Published", format: "number" },
  { key: "empty", kind: "number", label: "Nothing in it", format: "number" },
  { key: "rejected", kind: "number", label: "Rejected", format: "number" },
  { key: "unread", kind: "number", label: "Unread", format: "number" },
];

/** Every outlet and detector that has delivered anything, with what became of it. */
export async function sourceTable(): Promise<Table> {
  const [articles, events] = await Promise.all([
    articleSources(),
    eventSources(),
  ]);
  const rows: Row[] = [
    ...articles.map((s) => ({ ...s, feed: "Articles" })),
    ...events.map((s) => ({ ...s, feed: "Events" })),
  ].map((s) => ({
    source: sourceLabel(s.source),
    feed: s.feed,
    total: s.total,
    last24h: s.last24h,
    lastAt: s.lastAt,
    published: s.feed === "Articles" ? s.published : null,
    empty: s.feed === "Articles" ? s.empty : null,
    rejected: s.feed === "Articles" ? s.rejected : null,
    unread: s.feed === "Articles" ? s.unread : null,
  }));
  return { columns: SOURCE_COLUMNS, rows, total: rows.length };
}

const REGION_COLUMNS: ColumnSpec[] = [
  { key: "name", kind: "text", label: "Region" },
  { key: "kind", kind: "choice", label: "Kind" },
  { key: "iso", kind: "text", label: "ISO" },
  { key: "tripsAhead", kind: "number", label: "Trips ahead", format: "number" },
  { key: "tripsEver", kind: "number", label: "Trips ever", format: "number" },
  { key: "active", kind: "number", label: "Active events", format: "number" },
  { key: "worst", kind: "choice", label: "Worst active" },
  { key: "events", kind: "number", label: "All events", format: "number" },
  { key: "lastAt", kind: "date", label: "Last event", format: "date" },
  { key: "pairs", kind: "number", label: "Matches", format: "number" },
];

export async function regionTable(): Promise<Table> {
  const regions = await regionSummaries();
  const rows: Row[] = regions.map((r) => ({
    name: r.name,
    kind: r.kind,
    iso: r.isoRegion,
    tripsAhead: r.tripsAhead,
    tripsEver: r.tripsEver,
    active: r.activeEvents,
    worst: r.worstActive,
    events: r.events,
    lastAt: r.lastObservedAt,
    pairs: r.pairs,
  }));
  return { columns: REGION_COLUMNS, rows, total: rows.length };
}
