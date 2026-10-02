import { z } from "zod";
import type { LonLat } from "../geo.ts";
import {
  dayKey,
  nodeEnd,
  placeIdsOf,
  sortedNodes,
  type TripDoc,
} from "./document.ts";
import { applyOps, type PatchOp } from "./patch.ts";
import { retime } from "./retime.ts";
import { typicalMinutes } from "./slot.ts";
import type { TravelEstimator } from "./travel.ts";
import { type PlaceInfo, validateProposal } from "./validate.ts";

// Suggested changes to one stop: another time, another length, another place.
//
// The options are built here, deterministically, as the same patch ops the
// traveller's own edits are, and each is held to the day it would go into: an
// option that introduces any error — an overlap, a way too short, a closed door,
// a walk in the dark — is not an option. A model may then choose among them and
// say why (the port below), but it can only name an option it was given, so
// whatever it says, nothing reaches the traveller that was not already sound.
// And nothing is applied here or by the model: the traveller applies one, as
// they would apply an edit of their own.

const MIN = 60_000;
const STEP = 15 * MIN;

export type SuggestContext = {
  places: ReadonlyMap<string, PlaceInfo>;
  travel: TravelEstimator;
  /**
   * The category of each place the document uses, for how long people usually
   * stay. Without it no change of length is offered.
   */
  categories?: ReadonlyMap<string, string>;
  /** Tbilisi hours (0–23) with rain on the stop's day, when it is known. */
  wet?: ReadonlySet<number>;
};

/** A place that could take a stop's slot, as the catalogue offers it. */
export type SwapCandidate = {
  id: string;
  name: string;
  category: string;
  group: string;
  tier: PlaceInfo["tier"];
  lonLat: LonLat;
  outdoor: boolean;
  /** From the stop being changed. */
  distanceM: number | null;
};

export type SuggestionKind = "time" | "length" | "swap";

export type SuggestionDraft = {
  /** Stable for the same option: `time:<instant>`, `length:<min>`, `swap:<place>`. */
  id: string;
  kind: SuggestionKind;
  title: string;
  /** The reason in the rules' own words; a model may replace it. */
  reason: string;
  /** Plain facts about the option, for a model to choose and phrase from. */
  facts: string;
  /** What changes on this stop: "Start 16:00 → 15:15". */
  changes: string[];
  /** What it moves besides: "Dinner 19:30 → 19:40". */
  moves: string[];
  ops: PatchOp[];
};

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const hhmm = (ms: number | string) => clock.format(new Date(ms));
const hourOf = (ms: number) => Number(hhmm(ms).slice(0, 2));
const wall = (day: string, hh: string) => Date.parse(`${day}T${hh}:00+04:00`);
const mins = (m: number) =>
  m < 60
    ? `${m} min`
    : m % 60
      ? `${Math.floor(m / 60)}h ${m % 60}m`
      : `${m / 60}h`;
const away = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;

/** Does a stretch of time touch an hour with rain? */
const isWet = (
  wet: ReadonlySet<number> | undefined,
  from: number,
  to: number,
) => {
  if (!wet || wet.size === 0) return false;
  for (let t = from; t < to; t += 30 * MIN) if (wet.has(hourOf(t))) return true;
  return wet.has(hourOf(to - 1));
};

type Checked = {
  ops: PatchOp[];
  pushed: { title: string; from: string; to: string }[];
};

/** The ops, if applying them leaves every day they touch free of errors. */
function sound(doc: TripDoc, ops: PatchOp[], ctx: SuggestContext): boolean {
  const result = validateProposal(doc, ops, {
    places: ctx.places,
    travel: ctx.travel,
    author: "user",
  });
  return result.ok && !result.introduced.some((v) => v.severity === "error");
}

function movesOf(pushed: Checked["pushed"]): string[] {
  return pushed.map((p) => `${p.title} ${hhmm(p.from)} → ${hhmm(p.to)}`);
}

function timeOptions(
  doc: TripDoc,
  id: string,
  ctx: SuggestContext,
): SuggestionDraft[] {
  const node = doc.nodes[id];
  const day = dayKey(node.startsAt);
  const current = Date.parse(node.startsAt);
  const length = node.durationMin * MIN;
  const currentWet = !node.indoor && isWet(ctx.wet, current, current + length);

  type Found = Checked & { at: number; dry: boolean };
  const found: Found[] = [];
  for (let t = wall(day, "08:00"); t <= wall(day, "20:00"); t += STEP) {
    if (t === current) continue;
    const out = retime(doc, id, { startsAt: new Date(t).toISOString() }, ctx);
    if (out.overflow || !sound(doc, out.ops, ctx)) continue;
    found.push({
      at: t,
      ops: out.ops,
      pushed: out.pushed,
      dry: !node.indoor && !isWet(ctx.wet, t, t + length),
    });
  }

  // Fewest other stops disturbed, then nearest the time it has. And different
  // enough to be worth the trouble: a quarter of an hour is not a suggestion, so
  // the nearest start at least 45 minutes off is the first choice, and a smaller
  // move only when nothing bigger fits.
  const rank = (a: Found, b: Found) =>
    a.pushed.length - b.pushed.length ||
    Math.abs(a.at - current) - Math.abs(b.at - current);
  const nearest = (side: (f: Found) => boolean) => {
    for (const gap of [45, 30, 15]) {
      const best = found
        .filter((f) => side(f) && Math.abs(f.at - current) >= gap * MIN)
        .sort(rank)[0];
      if (best) return best;
    }
    return undefined;
  };
  const earlier = nearest((f) => f.at < current);
  const later = nearest((f) => f.at > current);
  const dry = currentWet ? found.filter((f) => f.dry).sort(rank)[0] : undefined;

  // Near-duplicates are one suggestion: a start within half an hour of one
  // already offered says nothing new.
  const picks: Found[] = [];
  for (const f of [dry, earlier, later]) {
    if (f && picks.every((p) => Math.abs(p.at - f.at) >= 30 * MIN))
      picks.push(f);
  }
  return picks.map((f) => {
    const start = hhmm(f.at);
    const n = f.pushed.length;
    const why =
      f.dry && currentWet
        ? "Misses the rain"
        : f.at < current
          ? "Earlier in the day"
          : "Later in the day";
    return {
      id: `time:${new Date(f.at).toISOString()}`,
      kind: "time" as const,
      title: `Start at ${start} instead`,
      reason: `${why}${n === 0 ? " · nothing else has to move" : ` · moves ${n} later stop${n === 1 ? "" : "s"}`}`,
      facts: `start ${start} instead of ${hhmm(current)}${f.dry && currentWet ? ", dry while now it is wet" : ""}; ${n === 0 ? "no other stop moves" : `moves ${n} later stop${n === 1 ? "" : "s"}`}`,
      changes: [`Start ${hhmm(current)} → ${start}`],
      moves: movesOf(f.pushed),
      ops: f.ops,
    };
  });
}

function lengthOptions(
  doc: TripDoc,
  id: string,
  ctx: SuggestContext,
): SuggestionDraft[] {
  const node = doc.nodes[id];
  const category = node.placeId ? ctx.categories?.get(node.placeId) : undefined;
  if (!category) return [];
  const usual = typicalMinutes(category);
  const now = node.durationMin;
  // Only a change that is plausible: not a hike cut to a church visit.
  const shorter = now > usual * 1.3 && usual >= now * 0.5;
  const longer = now < usual * 0.75 && usual <= now * 2;
  if (!shorter && !longer) return [];

  const out = retime(doc, id, { durationMin: usual }, ctx);
  if (out.overflow || !sound(doc, out.ops, ctx)) return [];
  return [
    {
      id: `length:${usual}`,
      kind: "length",
      title: `Make it ${mins(usual)}`,
      reason: `${shorter ? "People usually need less" : "People usually stay longer"} at a ${category.replace(/_/g, " ")} · ${mins(usual)} is typical`,
      facts: `${mins(usual)} instead of ${mins(now)}, the usual time at a ${category.replace(/_/g, " ")}`,
      changes: [`Takes ${mins(now)} → ${mins(usual)}`],
      moves: movesOf(out.pushed),
      ops: out.ops,
    },
  ];
}

function swapOptions(
  doc: TripDoc,
  id: string,
  candidates: readonly SwapCandidate[],
  ctx: SuggestContext,
): SuggestionDraft[] {
  const node = doc.nodes[id];
  const inTrip = new Set(placeIdsOf(doc));
  const prefix =
    node.meta.title.match(/^(Breakfast|Lunch|Coffee|Dinner) · /)?.[0] ?? "";
  const was = node.meta.title.slice(prefix.length);
  const out: SuggestionDraft[] = [];

  for (const cand of candidates) {
    // Never one already in the trip, never an unchecked one: generation's own rule.
    if (inTrip.has(cand.id) || cand.tier === "raw") continue;
    const usual = typicalMinutes(cand.category);
    const length =
      usual >= node.durationMin * 0.5 && usual <= node.durationMin * 2
        ? usual
        : node.durationMin;

    const swap: PatchOp[] = [
      { op: "replace", path: `/nodes/${id}/placeId`, value: cand.id },
      { op: "replace", path: `/nodes/${id}/indoor`, value: !cand.outdoor },
      {
        op: "replace",
        path: `/nodes/${id}/meta`,
        value: { ...node.meta, title: `${prefix}${cand.name}` },
      },
    ];
    // The pushes are worked out against the day with the new place in it: it is
    // somewhere else, so the way to what follows is different.
    const swapped = applyOps(doc, swap).doc;
    const retimed = retime(
      swapped,
      id,
      { durationMin: length },
      {
        places: ctx.places,
        travel: ctx.travel,
      },
    );
    if (retimed.overflow) continue;
    const ops = [...swap, ...retimed.ops];
    if (!sound(doc, ops, ctx)) continue;

    const describe = [
      cand.category.replace(/_/g, " "),
      cand.outdoor ? "outdoors" : "indoors",
      cand.tier === "curated" ? "hand-checked" : "verified",
      cand.distanceM === null ? null : `${away(cand.distanceM)} away`,
    ].filter(Boolean);
    out.push({
      id: `swap:${cand.id}`,
      kind: "swap",
      title: `Go to ${cand.name} instead`,
      reason: describe.join(" · "),
      facts: `${cand.name}: ${describe.join(", ")}, ${mins(length)}${retimed.pushed.length ? `; moves ${retimed.pushed.length} later stop${retimed.pushed.length === 1 ? "" : "s"}` : ""}`,
      changes: [
        `${was} → ${cand.name}`,
        ...(length === node.durationMin
          ? []
          : [`Takes ${mins(node.durationMin)} → ${mins(length)}`]),
      ],
      moves: movesOf(retimed.pushed),
      ops,
    });
    if (out.length >= 4) break;
  }
  return out;
}

/**
 * Every sound way to change this stop that the rules can find. A drive and a
 * check-in are the day's fixed points — the way between bases, and where the
 * night is — and are not offered changes.
 */
export function draftSuggestions(
  doc: TripDoc,
  id: string,
  candidates: readonly SwapCandidate[],
  ctx: SuggestContext,
): SuggestionDraft[] {
  const node = doc.nodes[id];
  if (!node || (node.kind !== "visit" && node.kind !== "meal")) return [];
  return [
    ...timeOptions(doc, id, ctx),
    ...lengthOptions(doc, id, ctx),
    ...swapOptions(doc, id, candidates, ctx),
  ];
}

/**
 * What the traveller asked for, read in the plainest way, for when no model is
 * there to read it: "indoors", "earlier", "later", "shorter", "longer". The
 * options that answer it come first; the rest keep their order.
 */
export function rankForWish(
  drafts: readonly SuggestionDraft[],
  wish: string | null,
): SuggestionDraft[] {
  const text = (wish ?? "").toLowerCase();
  const score = (d: SuggestionDraft) => {
    let n = 0;
    if (
      /indoor|inside|rain|wet|cold/.test(text) &&
      d.kind === "swap" &&
      /indoors/.test(d.facts)
    )
      n += 2;
    if (/rain|wet|dry/.test(text) && /rain/i.test(d.reason)) n += 2;
    if (
      /earlier|early|morning|before/.test(text) &&
      d.kind === "time" &&
      /^Earlier/.test(d.reason)
    )
      n += 2;
    if (
      /later|late|after|evening/.test(text) &&
      d.kind === "time" &&
      /^Later/.test(d.reason)
    )
      n += 2;
    if (
      /short|quick|less|brief/.test(text) &&
      d.kind === "length" &&
      /need less/.test(d.reason)
    )
      n += 2;
    if (
      /long|more|stay|extra/.test(text) &&
      d.kind === "length" &&
      /stay longer/.test(d.reason)
    )
      n += 2;
    if (
      /else|another|different|instead|swap|alternative/.test(text) &&
      d.kind === "swap"
    )
      n += 1;
    return n;
  };
  return drafts
    .map((d, i) => ({ d, i, n: score(d) }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.d);
}

// The model's part -------------------------------------------------------------

export const picksSchema = z.object({
  picks: z
    .array(z.object({ id: z.string(), reason: z.string().min(1).max(280) }))
    .max(6),
});

export type Pick = { id: string; reason: string };

/** Which of the options to show and why, as the model's reply to the port below. */
export type Suggester = (input: {
  /** The stop and its day as plain lines: no ids, no coordinates. */
  context: string;
  /** What the traveller asked for, if they said. */
  wish: string | null;
  options: { id: string; facts: string }[];
}) => Promise<unknown>;

/**
 * The reply held to its schema and to the options it was given: an id that was
 * never offered is dropped, one named twice is shown once, and no more than three
 * are shown. Null when the reply is not the schema at all.
 */
export function readPicks(
  raw: unknown,
  valid: ReadonlySet<string>,
): Pick[] | null {
  const parsed = picksSchema.safeParse(raw);
  if (!parsed.success) return null;
  const seen = new Set<string>();
  const picks: Pick[] = [];
  for (const p of parsed.data.picks) {
    if (!valid.has(p.id) || seen.has(p.id)) continue;
    seen.add(p.id);
    picks.push({ id: p.id, reason: p.reason.trim() });
    if (picks.length === 3) break;
  }
  return picks;
}

/** The stop in its day, for the model: times and titles, nothing it could cite as a source. */
export function describeStop(doc: TripDoc, id: string): string {
  const node = doc.nodes[id];
  const day = dayKey(node.startsAt);
  const lines = sortedNodes(doc.nodes)
    .filter((e) => dayKey(e.node.startsAt) === day)
    .map(
      (e) =>
        `${e.id === id ? "=> " : "- "}${hhmm(e.node.startsAt)}–${hhmm(nodeEnd(e.node))} ${e.node.meta.title} (${e.node.kind}, ${e.node.indoor ? "indoors" : "outdoors"})`,
    );
  return `The stop to change is marked =>.\n${lines.join("\n")}`;
}
