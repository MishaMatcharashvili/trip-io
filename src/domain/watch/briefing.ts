import { z } from "zod";
import { dayKey } from "../trip/document.ts";
import type { EventKind, Severity } from "./event.ts";
import { severityRank } from "./event.ts";
import type { Impact, Verdict } from "./judge.ts";
import type { Proposal } from "./proposal.ts";

// Stage 6, and the first stage a traveller ever sees. Everything the router
// sent to `briefing` for one trip-day, written as one thing to read at 07:30
// rather than N notifications nobody asked for.
//
// The briefing is the safe channel: it costs the traveller nothing to receive,
// which is why it ships a phase before anything is allowed to wake anyone up.
// That safety is only real if the briefing is honest, so the same principle
// that governs the judge governs it — the model chooses and writes, the code
// supplies the facts.
//
// Concretely: the model never restates evidence, never names a place, and
// never invents an item. It is given a numbered bundle and may only reorder,
// merge and headline it; the evidence line, the source, the timestamp and the
// proposed ops are all copied from the verdict the judge already had checked.
// A model that hallucinates here cannot hallucinate a fact — only a bad
// sentence about a real one, which the eval harness can see and a validator
// cannot.

/**
 * How many items one briefing may carry. Past this the day is not a briefing,
 * it is a list, and the traveller stops reading — which costs more than the
 * items left out. Overflow stays unsent and is offered again tomorrow.
 */
export const MAX_ITEMS = 6;

/**
 * Detectors that actually run. The briefing says how many sources watched
 * overnight, and it says the true number: claiming coverage the system does not
 * have is the one lie that would make every other line worthless. Phase 8 adds
 * to this list as each detector lands.
 */
export const WATCHED_SOURCES = ["open-meteo"] as const;

/** What a dot on the briefing means, in the palette's three jobs. */
export const briefingTones = ["alert", "ok", "agent"] as const;
export type BriefingTone = (typeof briefingTones)[number];

/** One briefing-routed verdict, ready to be written about. */
export type BriefingItem = {
  matchId: string;
  eventId: string;
  nodeId: string;
  kind: EventKind;
  severity: Severity;
  source: string;
  score: number;
  /** The stop the event matched, so a line can say which one it means. */
  nodeTitle: string;
  nodeStartsAt: string;
  verdict: Verdict;
};

export type BriefingStop = {
  id: string;
  title: string;
  startsAt: string;
  durationMin: number;
  indoor: boolean;
};

/** The shape of the day ahead, which every briefing carries with or without news. */
export type BriefingDay = {
  /** Tbilisi calendar date, YYYY-MM-DD. */
  date: string;
  /** Day n of the trip, counted from its first day. */
  index: number;
  stops: BriefingStop[];
};

// ---------------------------------------------------------------------------
// What the model is asked for, and what it is not

/**
 * A line may cite more than one item: two stops under the same rain is one
 * sentence, not two. The union of every line's refs must be exactly the bundle
 * — see `checkDraft`, which is what stops a merge from becoming a deletion.
 */
export const briefingLine = z.object({
  refs: z.array(z.number().int().min(0)).min(1).max(MAX_ITEMS),
  title: z.string().min(1).max(90),
  detail: z.string().min(1).max(140),
});

export const briefingDraft = z.object({
  /** One sentence on the shape of the day. The only free prose in the format. */
  greeting: z.string().min(1).max(220),
  lines: z.array(briefingLine).min(1).max(MAX_ITEMS),
  /**
   * At most one change worth making. One, because a briefing offering three
   * rearrangements is asking the traveller to plan, which is the job they
   * delegated.
   *
   * `nullish` rather than `nullable`: "no change today" is the common answer,
   * and a model may express it by sending null or by leaving the key out. Both
   * mean the same thing and neither is worth losing a morning's briefing over.
   */
  change: z
    .object({
      ref: z.number().int().min(0),
      sentence: z.string().min(1).max(240),
    })
    .nullish(),
});
export type BriefingDraft = z.infer<typeof briefingDraft>;

/** What the composer is shown. Nothing else about the trip reaches the model. */
export type BrieferInput = {
  day: BriefingDay;
  trip: {
    title: string;
    party: Record<string, unknown>;
    pace: string;
    prefs: Record<string, unknown>;
  };
  /** The bundle, in the order the refs count from. */
  items: {
    ref: number;
    what: EventKind;
    severity: Severity;
    impact: Impact;
    horizonHrs: number;
    stop: string;
    stopStartsAt: string;
    oneLine: string;
    hasProposal: boolean;
  }[];
};

/** The port. `src/infra/gemini-briefing.ts` is the only implementation. */
export type Briefer = (input: BrieferInput) => Promise<unknown>;

/** One email, as the delivery layer needs it and no provider's shape. */
export type Message = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type Delivery =
  | { sent: true; id: string }
  | { sent: false; error: string };

/**
 * The second port. `src/infra/resend.ts` is the only implementation, and it
 * reports a refusal rather than throwing: a provider that is down must cost the
 * traveller their email, never their briefing — the in-app one is already
 * written by the time this is called.
 */
export type Mailer = (message: Message) => Promise<Delivery>;

export const briefingRejectionReasons = [
  "malformed",
  "unknown-ref",
  "duplicate-ref",
  "dropped-item",
  "change-without-proposal",
] as const;
export type BriefingRejectionReason = (typeof briefingRejectionReasons)[number];

export type BriefingRejection = {
  reason: BriefingRejectionReason;
  detail: string;
};

/**
 * The guards. Every one of them is about the bundle, not about the prose: the
 * model may say what it likes about an item, and may say nothing at all about
 * an item it was given.
 *
 * Returns every reason rather than the first, for the same reason `checkVerdict`
 * does — one rejection reason in the log would hide the other.
 */
export function checkDraft(
  draft: BriefingDraft,
  items: readonly BriefingItem[],
): BriefingRejection[] {
  const rejections: BriefingRejection[] = [];
  const seen = new Set<number>();

  for (const line of draft.lines) {
    for (const ref of line.refs) {
      if (ref >= items.length) {
        rejections.push({
          reason: "unknown-ref",
          detail: `line cites item ${ref}; the bundle has ${items.length}`,
        });
        continue;
      }
      if (seen.has(ref)) {
        rejections.push({
          reason: "duplicate-ref",
          detail: `item ${ref} is written about twice`,
        });
        continue;
      }
      seen.add(ref);
    }
  }

  // Merging two items into one line is allowed; losing one is not. A briefing
  // that quietly omits the thing that mattered is worse than no briefing,
  // because the traveller has been told they are covered.
  for (const [ref, item] of items.entries()) {
    if (!seen.has(ref)) {
      rejections.push({
        reason: "dropped-item",
        detail: `item ${ref} (${item.kind} at ${item.nodeTitle}) is in no line`,
      });
    }
  }

  const change = draft.change;
  if (change) {
    const item = items[change.ref];
    if (!item) {
      rejections.push({
        reason: "unknown-ref",
        detail: `change cites item ${change.ref}; the bundle has ${items.length}`,
      });
    } else if (item.verdict.proposals.length === 0) {
      // "One change recommended" with nothing to apply is the briefing's own
      // version of the empty-helpful verdict: a button that does nothing.
      rejections.push({
        reason: "change-without-proposal",
        detail: `item ${change.ref} proposes no moves`,
      });
    }
  }

  return rejections;
}

// ---------------------------------------------------------------------------
// The document

export type BriefingLine = {
  /** The matches this line speaks for. */
  matchIds: string[];
  /** "Weather", "Roads" — the detector, as the traveller would name it. */
  kind: string;
  tone: BriefingTone;
  title: string;
  detail: string;
  /** Source and timestamp, copied from the verdicts. Never model-written. */
  evidence: string[];
};

export type BriefingChange = {
  matchId: string;
  eventId: string;
  nodeId: string;
  sentence: string;
  evidence: string;
  /** Accepted or rejected as a unit, and never applied without that. */
  proposals: Proposal[];
};

export type Briefing = {
  tripId: string;
  day: BriefingDay;
  /** True when there was nothing to report, which is a result, not a failure. */
  quiet: boolean;
  greeting: string;
  lines: BriefingLine[];
  change: BriefingChange | null;
  /** Every match this briefing delivered, so none of them is offered twice. */
  matchIds: string[];
  sources: number;
  composedAt: string;
};

const KIND_LABELS: Record<string, string> = { weather: "Weather" };

/** The detector a kind belongs to, as a word rather than a namespace. */
export const kindLabel = (kind: EventKind): string =>
  KIND_LABELS[kind.split(".")[0]] ?? "Watch";

/**
 * Colour does exactly three jobs, so impact decides and severity does not:
 * coral marks a real disruption, periwinkle marks the agent finding something
 * better, green means all clear. A "degrades" verdict is a disruption — the
 * traveller's afternoon is worse than they planned it — so it reads coral too.
 */
export const toneFor = (impact: Impact): BriefingTone => {
  switch (impact) {
    case "improves":
      return "agent";
    case "blocks":
    case "degrades":
      return "alert";
    case "none":
      return "ok";
  }
};

const worstTone = (items: readonly BriefingItem[]): BriefingTone => {
  if (items.some((i) => toneFor(i.verdict.impact) === "alert")) return "alert";
  if (items.some((i) => toneFor(i.verdict.impact) === "agent")) return "agent";
  return "ok";
};

const dedupe = (values: string[]) => [...new Set(values)];

/** Day n of the trip, counted inclusively from its first Tbilisi date. */
export function dayIndexOf(tripStartsAt: string, date: string): number {
  const first = Date.parse(`${dayKey(tripStartsAt)}T00:00:00Z`);
  const on = Date.parse(`${date}T00:00:00Z`);
  return Math.max(1, Math.round((on - first) / 86_400_000) + 1);
}

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "09:00" in Tbilisi, which is the only clock this product tells time on. */
export const at = (instant: string) => clock.format(new Date(instant));

/**
 * The day in one clause, for the briefings the model does not write: how many
 * stops, and between what times. Deliberately dull — a template that tried to
 * sound like the model would be the place a fallback started lying.
 */
export function dayShape(day: BriefingDay): string {
  const stops = day.stops;
  if (stops.length === 0) return "Nothing scheduled today.";
  const first = at(stops[0].startsAt);
  const last = at(stops[stops.length - 1].startsAt);
  const count = stops.length === 1 ? "One stop" : `${stops.length} stops`;
  return stops.length === 1
    ? `${count} today, at ${first}.`
    : `${count} today, ${first} to ${last}.`;
}

export type ComposeInput = {
  tripId: string;
  day: BriefingDay;
  items: readonly BriefingItem[];
  now: Date;
};

/**
 * The model's draft plus the bundle, as the document that gets stored and sent.
 * Every fact comes from the item; only `greeting`, `title`, `detail` and the
 * change sentence come from the draft.
 */
export function composeBriefing(
  input: ComposeInput,
  draft: BriefingDraft,
): Briefing {
  const lines: BriefingLine[] = draft.lines.map((line) => {
    const cited = line.refs
      .map((ref) => input.items[ref])
      .filter((i): i is BriefingItem => Boolean(i));
    return {
      matchIds: cited.map((i) => i.matchId),
      kind: cited[0] ? kindLabel(cited[0].kind) : "Watch",
      tone: worstTone(cited),
      title: line.title,
      detail: line.detail,
      evidence: dedupe(cited.map((i) => i.verdict.evidence)),
    };
  });

  const chosen = draft.change ? input.items[draft.change.ref] : undefined;

  return {
    tripId: input.tripId,
    day: input.day,
    quiet: false,
    greeting: draft.greeting,
    lines,
    change:
      chosen && draft.change
        ? {
            matchId: chosen.matchId,
            eventId: chosen.eventId,
            nodeId: chosen.nodeId,
            sentence: draft.change.sentence,
            evidence: chosen.verdict.evidence,
            proposals: chosen.verdict.proposals,
          }
        : null,
    matchIds: input.items.map((i) => i.matchId),
    sources: WATCHED_SOURCES.length,
    composedAt: input.now.toISOString(),
  };
}

/**
 * The briefing for a day with nothing on it, built without a model call.
 *
 * Paying for prose that says "nothing happened" is the wrong trade twice over:
 * it costs a call per quiet trip-day — which is most of them at 0.8 matched
 * pairs per trip-day — and it points a model at an empty bundle and asks it to
 * be interesting, which is precisely the shape that produces the invented
 * reassurance the whole judge design exists to refuse.
 *
 * So the quiet briefing is a template, and it says only what is true: what the
 * day looks like, and how many sources found nothing.
 */
export function quietBriefing(input: Omit<ComposeInput, "items">): Briefing {
  const sources = WATCHED_SOURCES.length;
  return {
    tripId: input.tripId,
    day: input.day,
    quiet: true,
    greeting: dayShape(input.day),
    lines: [
      {
        matchIds: [],
        kind: "All clear",
        tone: "ok",
        title: "Nothing to report",
        detail:
          sources === 1
            ? "One source watched overnight and found nothing on your route."
            : `${sources} sources watched overnight and found nothing on your route.`,
        evidence: [],
      },
    ],
    change: null,
    matchIds: [],
    sources,
    composedAt: input.now.toISOString(),
  };
}

/**
 * The briefing to send when the model's draft cannot be trusted, or the model
 * cannot be reached.
 *
 * Phase 2's rule applies unchanged: never render an unvalidated plan. A day
 * with real news on it must not go silent because a composer failed, so the
 * fallback writes the verdicts out plainly — every sentence here was already
 * checked by the judge's own guards, so this is the least interesting briefing
 * that is still entirely true.
 */
export function fallbackBriefing(input: ComposeInput): Briefing {
  const items = [...input.items];
  const withProposal = items
    .filter((i) => i.verdict.proposals.length > 0)
    .sort((a, b) => b.score - a.score)[0];

  return {
    tripId: input.tripId,
    day: input.day,
    quiet: false,
    greeting: `${dayShape(input.day)} ${
      items.length === 1
        ? "One thing worth knowing."
        : `${items.length} things worth knowing.`
    }`,
    lines: items.map((item) => ({
      matchIds: [item.matchId],
      kind: kindLabel(item.kind),
      tone: toneFor(item.verdict.impact),
      title: item.verdict.oneLine,
      detail: `${item.nodeTitle} · ${at(item.nodeStartsAt)}`,
      evidence: [item.verdict.evidence],
    })),
    change: withProposal
      ? {
          matchId: withProposal.matchId,
          eventId: withProposal.eventId,
          nodeId: withProposal.nodeId,
          sentence: withProposal.verdict.oneLine,
          evidence: withProposal.verdict.evidence,
          proposals: withProposal.verdict.proposals,
        }
      : null,
    matchIds: items.map((i) => i.matchId),
    sources: WATCHED_SOURCES.length,
    composedAt: input.now.toISOString(),
  };
}

export type BriefingResult =
  | { ok: true; briefing: Briefing }
  | { ok: false; briefing: Briefing; rejections: BriefingRejection[] };

/**
 * Decode, check, and fall back in one step: the only way a draft is allowed to
 * become a briefing. A rejected draft still produces a briefing — the fallback
 * one — because the alternative is a traveller who was told they are being
 * watched receiving nothing on the morning it mattered.
 */
export function readDraft(raw: unknown, input: ComposeInput): BriefingResult {
  const parsed = briefingDraft.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      briefing: fallbackBriefing(input),
      rejections: [
        {
          reason: "malformed",
          detail: parsed.error.issues
            .map((i) => `${i.path.join("/")}: ${i.message}`)
            .join("; "),
        },
      ],
    };
  }

  const rejections = checkDraft(parsed.data, input.items);
  return rejections.length > 0
    ? { ok: false, briefing: fallbackBriefing(input), rejections }
    : { ok: true, briefing: composeBriefing(input, parsed.data) };
}

/**
 * The bundle, shortest-horizon-worst-first, capped. Sorting by score rather
 * than by time is deliberate: if something has to wait for tomorrow, it should
 * be the mildest thing, not the latest one.
 */
export function bundle(
  items: readonly BriefingItem[],
  max = MAX_ITEMS,
): { taken: BriefingItem[]; overflow: BriefingItem[] } {
  const ranked = [...items].sort(
    (a, b) =>
      b.score - a.score ||
      severityRank(b.severity) - severityRank(a.severity) ||
      Date.parse(a.nodeStartsAt) - Date.parse(b.nodeStartsAt),
  );
  return { taken: ranked.slice(0, max), overflow: ranked.slice(max) };
}

/** What the model is shown, from what the pipeline has. */
export function brieferInput(
  input: ComposeInput,
  trip: BrieferInput["trip"],
): BrieferInput {
  return {
    day: input.day,
    trip,
    items: input.items.map((item, ref) => ({
      ref,
      what: item.kind,
      severity: item.severity,
      impact: item.verdict.impact,
      horizonHrs: item.verdict.horizonHrs,
      stop: item.nodeTitle,
      stopStartsAt: item.nodeStartsAt,
      oneLine: item.verdict.oneLine,
      hasProposal: item.verdict.proposals.length > 0,
    })),
  };
}
