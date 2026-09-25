import { z } from "zod";
import { patchOps } from "../trip/patch.ts";
import { at, kindLabel } from "./briefing.ts";
import { type EventKind, eventKinds } from "./event.ts";
import { impacts, type Verdict } from "./judge.ts";
import { type NodeClock, proposal, toOps } from "./proposal.ts";
import {
  inQuietHours,
  type Ledger,
  type Route,
  type WatchSettings,
} from "./route.ts";

// Stage 5's second half, and the one that actually spends the budget.
//
// The router (route.ts) decides at judging time that a verdict is worth waking
// someone for. That decision is minutes old by the time a push can go out — the
// drain may be behind, the drive may have started, the clock may have crossed
// into quiet hours, and another judge job for the same trip may have spent the
// last slot a moment ago. So delivery asks again, under a lock on the watch,
// and every "no" is written down with its reason, exactly as the router's are.
//
// The budget is the product. With four interrupts to spend over a week, the
// fifth merely-interesting thing has to lose to something better; an enforcer
// that two concurrent jobs can talk past is not enforcing anything.

// ---------------------------------------------------------------------------
// The offer: what the traveller was shown

/**
 * A snapshot of what an intervention offered, stored on `intervention.offer`.
 *
 * `ops` are absolute — "the hike starts at 11:30" — computed against the day as
 * it stood when the offer was made. The judge proposes relative moves ("two
 * hours earlier"), and replaying a relative move at accept time would move a
 * stop twice if the traveller had already moved it themselves.
 */
export const offer = z.object({
  matchId: z.uuid(),
  nodeId: z.uuid(),
  kind: z.enum(eventKinds),
  oneLine: z.string(),
  /** The briefing's change sentence, when the offer came from a briefing. */
  sentence: z.string().optional(),
  evidence: z.string(),
  impact: z.enum(impacts),
  horizonHrs: z.number(),
  confidence: z.number(),
  proposals: z.array(proposal),
  ops: patchOps,
});
export type Offer = z.infer<typeof offer>;

/**
 * An offer from a verdict. A proposal naming a stop the trip no longer has
 * leaves the offer with nothing to apply rather than half a cascade: moving the
 * hike without moving the lunch it displaces is worse than moving nothing.
 */
export function makeOffer(input: {
  matchId: string;
  nodeId: string;
  kind: EventKind;
  verdict: Verdict;
  clocks: ReadonlyMap<string, NodeClock>;
  sentence?: string;
  /** False for a briefing item that was not the one change it nominated. */
  actionable?: boolean;
}): Offer {
  const { verdict } = input;
  const translated =
    input.actionable === false
      ? { ops: [], errors: [] }
      : toOps(verdict.proposals, input.clocks);
  const usable = translated.errors.length === 0 && translated.ops.length > 0;

  return {
    matchId: input.matchId,
    nodeId: input.nodeId,
    kind: input.kind,
    oneLine: verdict.oneLine,
    ...(input.sentence ? { sentence: input.sentence } : {}),
    evidence: verdict.evidence,
    impact: verdict.impact,
    horizonHrs: verdict.horizonHrs,
    confidence: verdict.confidence,
    proposals: usable ? verdict.proposals : [],
    ops: usable ? translated.ops : [],
  };
}

// ---------------------------------------------------------------------------
// Delivery: the router's answer, asked again at send time

export const deliveryReasons = [
  // The event's window has closed — a road reopened, a spell re-forecast away.
  "event-over",
  // The stop has already ended. Too late for a push, and for a briefing.
  "too-late",
  // This trip was already interrupted about this event, over another stop.
  "covered",
  "no-interrupt-channel",
  "quiet-hours",
  "budget-spent",
  // Push is on, but nothing is registered to receive it.
  "no-device",
  // The proposal would break the day. An interrupt must carry a working action
  // or, by the judge's own choice, none; a button that fails is worse than
  // waiting for the briefing, where the card can say why.
  "incoherent-proposal",
  // Every token refused it, on the last attempt the queue allows.
  "push-failed",
] as const;
export type DeliveryReason = (typeof deliveryReasons)[number];

export type DeliveryInput = {
  now: Date;
  event: { validTo: string | null };
  node: { startsAt: string; durationMin: number };
  /** A push for this event on this trip already exists, reserved or sent. */
  covered: boolean;
  /** Pushes reserved or sent for this trip, and its cap. */
  ledger: Ledger;
  watch: WatchSettings;
  devices: number;
  /** Whether the offer's ops leave every day they touch coherent. */
  coherent: boolean;
};

export type DeliveryDecision =
  | { deliver: true }
  | { deliver: false; route: Route; reason: DeliveryReason };

/**
 * Whether to send the push now. Pure, like the router, and for the same
 * reason: the decision to wake someone is the one that most deserves a test.
 *
 * The order is the order of what can be undone. Something that is over is
 * dropped; something already said is not said twice; only then does the budget
 * get a say — and a verdict the budget turns away goes to the briefing, where
 * it costs nothing, rather than nowhere.
 */
export function checkDelivery(input: DeliveryInput): DeliveryDecision {
  const now = input.now.getTime();
  const briefing = (reason: DeliveryReason): DeliveryDecision => ({
    deliver: false,
    route: "briefing",
    reason,
  });

  if (input.event.validTo && Date.parse(input.event.validTo) <= now) {
    return { deliver: false, route: "drop", reason: "event-over" };
  }
  // The end, not the start: a road closing forty minutes into a three-hour
  // drive is exactly what an interrupt is for.
  const ends =
    Date.parse(input.node.startsAt) + input.node.durationMin * 60_000;
  if (ends <= now) return { deliver: false, route: "drop", reason: "too-late" };
  // Stays routed `interrupt`: this pair's news was delivered, by the push sent
  // for the event's other stop.
  if (input.covered) {
    return { deliver: false, route: "interrupt", reason: "covered" };
  }
  if (!input.watch.channels.includes("push")) {
    return briefing("no-interrupt-channel");
  }
  if (inQuietHours(input.now, input.watch.quietHours)) {
    return briefing("quiet-hours");
  }
  if (input.ledger.sentSoFar >= input.ledger.cap) {
    return briefing("budget-spent");
  }
  if (input.devices === 0) return briefing("no-device");
  if (!input.coherent) return briefing("incoherent-proposal");
  return { deliver: true };
}

// ---------------------------------------------------------------------------
// The push itself

export type PushMessage = {
  title: string;
  body: string;
  /** Opened on tap: the intervention card, where the choice is made. */
  url: string;
  interventionId: string;
};

export type PushTicket =
  | { token: string; ok: true }
  | {
      token: string;
      ok: false;
      error: string;
      /** The token will never work again (the app was deleted). */
      dead: boolean;
    };

/**
 * The port. `src/infra/expo-push.ts` is the only implementation. It reports
 * per token rather than throwing for one bad phone, and throws only when the
 * service itself could not be reached — which is worth a retry.
 */
export type Pusher = (
  message: PushMessage,
  tokens: readonly string[],
) => Promise<PushTicket[]>;

/** iOS cuts a notification title at about this; past it, the stop is lost. */
export const PUSH_TITLE_MAX = 60;

const clip = (text: string, max: number) =>
  text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;

/**
 * What lands on the lock screen. The title says which stop and when, from the
 * trip; the body is the judge's own sentence, which was written to offer a
 * choice rather than sound an alarm. Nothing here is composed by a model at
 * send time, so nothing here can be invented at send time.
 */
export function pushMessage(input: {
  offer: Offer;
  stop: { title: string; startsAt: string };
  url: string;
  interventionId: string;
}): PushMessage {
  return {
    title: clip(
      `${kindLabel(input.offer.kind)} · ${input.stop.title} at ${at(input.stop.startsAt)}`,
      PUSH_TITLE_MAX,
    ),
    body: input.offer.oneLine,
    url: input.url,
    interventionId: input.interventionId,
  };
}

// ---------------------------------------------------------------------------
// Outcomes

export const outcomes = ["accepted", "dismissed", "ignored", "muted"] as const;
export type Outcome = (typeof outcomes)[number];

/**
 * When an unanswered intervention stops being answerable, and the hourly sweep
 * may write `ignored`.
 *
 * A push expires at the end of the verdict's horizon — "act in the next two
 * hours" means un-actioned after two hours is ignored, which is the plan's own
 * definition. A briefing item expires when its stop starts: the briefing is
 * read over breakfast, and the change is still makeable until the stop begins.
 */
export function expiresAt(
  channel: "push" | "briefing",
  sentAt: Date,
  offer: Pick<Offer, "horizonHrs">,
  stopStartsAt: string,
): string {
  return channel === "push"
    ? new Date(sentAt.getTime() + offer.horizonHrs * 3_600_000).toISOString()
    : new Date(stopStartsAt).toISOString();
}

/**
 * Which outcome may overwrite which. The traveller's answer is final; the
 * sweep's inference is not. `ignored` is what the sweep concludes from silence,
 * so a traveller who answers after the window closed still overrules it — a
 * late accept is evidence, and the sweep's guess is not.
 */
export function mayRecord(current: Outcome | null, next: Outcome): boolean {
  if (next === "ignored") return current === null;
  return current === null || current === "ignored";
}

/**
 * A mute, at the settings layer: push taken away while the watch is awake.
 * Switching it off before the trip starts is a preference; switching it off
 * during one is the kill criterion.
 */
export function isMute(input: {
  before: readonly string[];
  after: readonly string[];
  now: Date;
  activeFrom: string;
  activeTo: string;
}): boolean {
  const now = input.now.getTime();
  return (
    input.before.includes("push") &&
    !input.after.includes("push") &&
    Date.parse(input.activeFrom) <= now &&
    now < Date.parse(input.activeTo)
  );
}
