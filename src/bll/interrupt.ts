import { activeTokens, disableTokens } from "../dal/devices.ts";
import {
  markPushSent,
  pushFor,
  releasePush,
  reservePush,
} from "../dal/interventions.ts";
import { loadRouted, markDelivered, rerouteMatch } from "../dal/matches.ts";
import { loadTrip } from "../dal/trips.ts";
import { withTransaction } from "../dal/tx.ts";
import { lockWatch, pushLedger } from "../dal/watches.ts";
import {
  checkDelivery,
  type DeliveryReason,
  expiresAt,
  makeOffer,
  type Pusher,
  pushMessage,
} from "../domain/watch/interrupt.ts";
import { pushWithExpo } from "../infra/expo-push.ts";
import { checkOps } from "./trip-document.ts";

// The interrupt path: a verdict the router sent to `interrupt`, re-checked,
// paid for, and pushed.
//
// The order is chosen for its failure modes. Everything that can refuse runs
// first and changes nothing. Then, under a lock on the trip's watch, the ledger
// is counted and a slot reserved — one step, so two deliveries for the same trip
// cannot both see the last free slot. Only after that commits is the push
// service called, and only a push it accepted is stamped sent. A reservation
// whose push never went anywhere is given back on the job's last attempt, and
// the verdict goes to the morning briefing rather than nowhere.

export const INTERRUPT_JOB = "interrupt";

export type InterruptDeps = {
  push?: Pusher;
  now?: () => Date;
  /** Set by the drain on the job's final attempt (see drain.ts). */
  lastChance?: boolean;
};

export type InterruptOutcome =
  | { ok: true; matchId: string; interventionId: string; devices: number }
  | {
      ok: false;
      matchId: string;
      reason: "gone" | "not-interrupt" | "already-delivered" | DeliveryReason;
    };

export async function deliverInterrupt(
  matchId: string,
  deps: InterruptDeps = {},
): Promise<InterruptOutcome> {
  const now = deps.now?.() ?? new Date();
  const refuse = (reason: Exclude<InterruptOutcome, { ok: true }>["reason"]) =>
    ({ ok: false, matchId, reason }) as const;

  const pair = await loadRouted(matchId);
  if (!pair?.verdict) return refuse("gone");
  // Rerouted by a delivery that already ran — a duplicate job, or a retry.
  if (pair.route !== "interrupt") return refuse("not-interrupt");
  if (pair.deliveredAt) return refuse("already-delivered");

  const trip = await loadTrip(pair.tripId);
  if (!trip) return refuse("gone");

  const offer = makeOffer({
    matchId,
    nodeId: pair.node.id,
    kind: pair.event.kind,
    verdict: pair.verdict,
    clocks: new Map(Object.entries(trip.doc.nodes)),
  });
  // The judge proposed moves that no longer translate (a stop it named is
  // gone), or proposed moves that would break the day: either way there is no
  // working button to put in front of someone we are about to wake.
  const proposed = pair.verdict.proposals.length > 0;
  const coherent = !proposed
    ? true
    : offer.ops.length > 0 &&
      (await checkOps(trip.doc, offer.ops, "intervention")).ok;

  const tokens = pair.userId ? await activeTokens(pair.userId) : [];

  const reserved = await withTransaction(async (tx) => {
    const watch = await lockWatch(tx, pair.tripId);
    const existing = await pushFor(tx, pair.tripId, pair.event.id);
    // Our own reservation from an attempt that died before the push went out:
    // resume it rather than counting it against ourselves.
    const resuming =
      existing && !existing.sentAt && existing.matchId === matchId
        ? existing
        : null;
    const ledger = await pushLedger(pair.tripId, tx);

    const decision = checkDelivery({
      now,
      event: { validTo: pair.event.validTo },
      node: pair.node,
      covered: Boolean(existing) && !resuming,
      ledger: {
        sentSoFar: ledger.sentSoFar - (resuming ? 1 : 0),
        cap: watch?.cap ?? 0,
      },
      watch: watch ?? { channels: [], quietHours: null },
      devices: tokens.length,
      coherent,
    });

    if (!decision.deliver) {
      if (resuming) await releasePush(resuming.id, tx);
      if (decision.reason === "covered") await markDelivered(matchId, tx);
      else await rerouteMatch(matchId, decision.route, decision.reason, tx);
      return { ok: false as const, reason: decision.reason };
    }

    const id =
      resuming?.id ??
      (await reservePush(tx, {
        tripId: pair.tripId,
        eventId: pair.event.id,
        offer,
        expiresAt: expiresAt("push", now, offer, pair.node.startsAt),
      }));
    return { ok: true as const, id };
  });

  if (!reserved.ok) return refuse(reserved.reason);

  const message = pushMessage({
    offer,
    stop: pair.node,
    // A path, not a URL: the native shell opens it inside the app, and the web
    // client resolves it against its own origin.
    url: `/trips/${pair.tripId}/alerts/${reserved.id}`,
    interventionId: reserved.id,
  });

  let tickets: Awaited<ReturnType<Pusher>>;
  try {
    tickets = await (deps.push ?? pushWithExpo)(message, tokens);
  } catch (error) {
    // The push service is down. Worth another try while tries remain — the
    // reservation holds the slot meanwhile — and not worth losing the verdict
    // over when they have run out.
    if (!deps.lastChance) throw error;
    await giveUp(reserved.id, matchId);
    return refuse("push-failed");
  }

  const dead = tickets.filter((t) => !t.ok && t.dead).map((t) => t.token);
  await disableTokens(dead, "DeviceNotRegistered");

  const delivered = tickets.filter((t) => t.ok).length;
  if (delivered === 0) {
    if (!deps.lastChance) {
      throw new Error(
        `no device accepted the push: ${tickets
          .map((t) => (t.ok ? "ok" : t.error))
          .join("; ")}`,
      );
    }
    await giveUp(reserved.id, matchId);
    return refuse("push-failed");
  }

  await markPushSent(reserved.id);
  await markDelivered(matchId);
  return {
    ok: true,
    matchId,
    interventionId: reserved.id,
    devices: delivered,
  };
}

/** The slot back, and the verdict to the morning, where it costs nothing. */
async function giveUp(interventionId: string, matchId: string) {
  await releasePush(interventionId);
  await rerouteMatch(matchId, "briefing", "push-failed");
}
