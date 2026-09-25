import {
  briefingBundle,
  briefingOn,
  byId,
  latestBriefing,
  liveTripDays,
  markOpened,
  recipientFor,
  recordEmail,
  type StoredBriefing,
  saveBriefing,
  stopsOn,
} from "../dal/briefings.ts";
import { enqueue } from "../dal/jobs.ts";
import { placeNames } from "../dal/places.ts";
import { dayKey } from "../domain/trip/document.ts";
import {
  type Briefer,
  type Briefing,
  type BriefingRejection,
  brieferInput,
  bundle,
  type ChangeRow,
  type ComposeInput,
  changePlaceIds,
  changePreview,
  dayIndexOf,
  fallbackBriefing,
  type Mailer,
  quietBriefing,
  readDraft,
} from "../domain/watch/briefing.ts";
import { renderBriefingEmail } from "../infra/briefing-email.ts";
import { briefWithGemini } from "../infra/gemini-briefing.ts";
import { emailConfigured, sendWithResend } from "../infra/resend.ts";

// Stage 6, in the order it happens: find the mornings, gather what there is to
// say, write it once, store it, send it.
//
// The split between `scheduleBriefings` and `writeBriefing` is the cron rule
// from docs/implementation-plan.md §5, not a style choice. The 03:30 handler
// touches no model: it finds the trips and posts one job each, so its runtime
// is a query however many travellers exist. The model call happens in the
// drain, where the 240s budget, the backoff and the give-up-at-five already
// live — and where a Gemini outage at 03:30 costs a retry rather than a day.

export const BRIEFING_JOB = "briefing";

/** Tbilisi's 07:30 is 03:30 UTC, which is when this is meant to run. */
export const BRIEFING_HOUR_TBILISI = "07:30";

export type ScheduleReport = {
  date: string;
  /** Trip-days found with a morning and no briefing yet. */
  trips: number;
  queued: number;
  ms: number;
};

/**
 * The cron handler. Idempotent by construction: `liveTripDays` excludes trips
 * that already have a briefing for the date, and the unique index on
 * `(trip_id, day)` settles the race that only narrows. Running it twice by hand
 * costs two queries and no model calls.
 */
export async function scheduleBriefings(
  now: Date = new Date(),
): Promise<ScheduleReport> {
  const started = Date.now();
  const date = dayKey(now);
  const trips = await liveTripDays(date);

  for (const trip of trips) {
    await enqueue(BRIEFING_JOB, { tripId: trip.tripId, date });
  }

  return {
    date,
    trips: trips.length,
    queued: trips.length,
    ms: Date.now() - started,
  };
}

export type BriefingDeps = {
  brief?: Briefer;
  mail?: Mailer;
  now?: () => Date;
  /** The origin every link in the email points at. */
  appUrl?: string;
  /**
   * Set by the drain on a job's final attempt. A composer that cannot be
   * reached is worth retrying — a 503 from the provider is usually a minute
   * old, and a briefing written from the fallback is plainer than one the model
   * would have written. But it is only worth retrying while retries remain:
   * past that the choice is between the plain briefing and none at all, and the
   * briefing is the only channel this product has.
   */
  lastChance?: boolean;
};

export type WriteOutcome =
  | {
      ok: true;
      briefingId: string;
      tripId: string;
      date: string;
      quiet: boolean;
      items: number;
      /** Items that did not fit this briefing and wait for tomorrow. */
      overflow: number;
      rejections: BriefingRejection[];
      email: "sent" | "skipped" | "failed";
      emailError?: string;
    }
  | {
      ok: false;
      tripId: string;
      date: string;
      reason: "no-morning" | "already-written";
    };

/**
 * One trip-day's briefing, written and delivered. The job handler.
 *
 * The order matters and is chosen for its failure mode. Compose, then store —
 * the store is the claim, and a second run that loses the race stops without
 * sending. Then email, which is allowed to fail: the traveller already has the
 * briefing in the app by the time it is attempted.
 */
export async function writeBriefing(
  tripId: string,
  date: string,
  deps: BriefingDeps = {},
): Promise<WriteOutcome> {
  const now = deps.now?.() ?? new Date();

  // Re-checked here and not only in the scheduler: a job can be retried hours
  // after it was posted, by which time the morning may already have been
  // written by a hand-run cron.
  if (await briefingOn(tripId, date)) {
    return { ok: false, tripId, date, reason: "already-written" };
  }

  const [trips, stops] = await Promise.all([
    liveTripDays(date),
    stopsOn(tripId, date),
  ]);
  const trip = trips.find((t) => t.tripId === tripId);
  if (!trip || stops.length === 0) {
    return { ok: false, tripId, date, reason: "no-morning" };
  }

  const { taken, overflow } = bundle(await briefingBundle(tripId, now));
  const input: ComposeInput = {
    tripId,
    day: {
      date,
      index: dayIndexOf(trip.startsAt, date),
      stops,
    },
    items: taken,
    now,
  };

  let briefing: Briefing;
  let rejections: BriefingRejection[] = [];

  if (taken.length === 0) {
    // No model call on a quiet day — see src/domain/watch/briefing.ts for why
    // that is a correctness decision and not only a cost one.
    briefing = quietBriefing(input);
  } else {
    const ask = brieferInput(input, {
      title: trip.title,
      party: trip.party,
      pace: trip.pace,
      prefs: trip.prefs,
    });

    let raw: unknown;
    try {
      raw = await (deps.brief ?? briefWithGemini)(ask);
    } catch (error) {
      // Thrown on, so the queue's backoff gets to try again — unless there is
      // nothing left to try, in which case the morning gets the plain briefing
      // rather than silence.
      if (!deps.lastChance) throw error;
      briefing = fallbackBriefing(input);
      rejections = [
        {
          reason: "composer-unreachable",
          detail: (error as Error).message.slice(0, 500),
        },
      ];
      return finish(input, briefing, rejections, taken, overflow, deps);
    }

    const read = readDraft(raw, input);
    briefing = read.briefing;
    if (!read.ok) rejections = read.rejections;
  }

  return finish(input, briefing, rejections, taken, overflow, deps);
}

/**
 * Store, then deliver, then report. Shared by the three ways a briefing gets
 * written — composed, refused into the fallback, or written without a model at
 * all — because the claim and the send must not differ between them.
 */
async function finish(
  input: ComposeInput,
  briefing: Briefing,
  rejections: BriefingRejection[],
  taken: readonly { eventId: string }[],
  overflow: readonly unknown[],
  deps: BriefingDeps,
): Promise<WriteOutcome> {
  const { tripId } = input;
  const date = input.day.date;

  const emailTo = await recipientFor(tripId);
  const saved = await saveBriefing({
    tripId,
    date,
    dayIndex: input.day.index,
    quiet: briefing.quiet,
    document: briefing,
    emailTo,
    matchIds: briefing.matchIds,
    // One per event, not per pair: the same rain over two stops is one thing
    // the traveller was told (src/dal/briefings.ts).
    eventIds: [...new Set(taken.map((i) => i.eventId))],
  });

  if (!saved) {
    return { ok: false, tripId, date, reason: "already-written" };
  }

  const email = await deliver(saved.id, briefing, emailTo, deps);

  return {
    ok: true,
    briefingId: saved.id,
    tripId,
    date,
    quiet: briefing.quiet,
    items: taken.length,
    overflow: overflow.length,
    rejections,
    ...email,
  };
}

async function deliver(
  briefingId: string,
  briefing: Briefing,
  emailTo: string | null,
  deps: BriefingDeps,
): Promise<{ email: "sent" | "skipped" | "failed"; emailError?: string }> {
  // An anonymous trip has no address (`recipientFor` does not count a guest's
  // placeholder as one). That is the designed behaviour — the trip is watched
  // and briefed in the app — not a failure, so nothing is recorded against it.
  if (!emailTo) return { email: "skipped" };

  const appUrl = (deps.appUrl ?? process.env.APP_URL ?? "").replace(/\/$/, "");
  if (!appUrl || (!deps.mail && !emailConfigured())) {
    const error = !appUrl
      ? "APP_URL is not set"
      : "RESEND_API_KEY or BRIEFING_FROM is not set";
    await recordEmail(briefingId, { sent: false, error });
    return { email: "failed", emailError: error };
  }

  const message = renderBriefingEmail(briefing, {
    briefing: `${appUrl}/trips/${briefing.tripId}/briefing`,
    settings: `${appUrl}/trips/${briefing.tripId}/watch`,
    pixel: `${appUrl}/api/briefings/${briefingId}/opened.gif`,
  });

  const result = await (deps.mail ?? sendWithResend)({
    to: emailTo,
    ...message,
  });

  await recordEmail(briefingId, result);
  return result.sent
    ? { email: "sent" }
    : { email: "failed", emailError: result.error };
}

/**
 * What the in-app briefing shows. Today's if it has been written, otherwise the
 * last one: at 06:00 the traveller has not had this morning's yet, and
 * yesterday's is still the last thing the system said.
 */
export async function briefingView(
  tripId: string,
  now: Date = new Date(),
): Promise<StoredBriefing | null> {
  return (
    (await briefingOn(tripId, dayKey(now))) ?? (await latestBriefing(tripId))
  );
}

export type BriefingPage = {
  briefing: StoredBriefing;
  /** The before-and-after of the recommended change, already resolved. */
  change: { sentence: string; rows: ChangeRow[] } | null;
};

/**
 * The in-app briefing, with the one thing the stored document cannot carry: the
 * names of any places the change would swap in. Proposals hold catalogue ids,
 * and an id is not something to show a traveller.
 *
 * Access is the caller's to check — the page knows whose trip it is
 * (src/bll/trip-document.ts, accessTrip) and this only reads.
 */
export async function briefingPage(
  tripId: string,
  now: Date = new Date(),
): Promise<BriefingPage | null> {
  const briefing = await briefingView(tripId, now);
  if (!briefing) return null;

  const change = briefing.document.change;
  if (!change) return { briefing, change: null };

  const ids = changePlaceIds(change);
  const names =
    ids.length > 0 ? await placeNames(ids) : new Map<string, string>();

  return {
    briefing,
    change: {
      sentence: change.sentence,
      rows: changePreview(change, briefing.document.day.stops, names),
    },
  };
}

/** Opened, once. The kill-criteria stamp (src/dal/briefings.ts). */
export async function openBriefing(id: string): Promise<boolean> {
  const briefing = await byId(id);
  if (!briefing) return false;
  await markOpened(id);
  return true;
}
