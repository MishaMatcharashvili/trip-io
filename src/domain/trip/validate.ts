import {
  isOpenThroughout,
  type OpeningHours,
} from "../catalogue/opening-hours.ts";
import type { PlaceTier } from "../catalogue/tier.ts";
import type { LonLat } from "../geo.ts";
import {
  dayKey,
  daysOf,
  locate,
  type NodeEntry,
  nodeEnd,
  type Pace,
  sortedNodes,
  type TripDoc,
  type TripNode,
} from "./document.ts";
import {
  applyOps,
  type Change,
  type PatchError,
  type PatchOp,
  patchOps,
} from "./patch.ts";
import { CIVIL, sunWindow } from "./sun.ts";
import type { TravelEstimator } from "./travel.ts";

// The coherent-day validator. Every intervention in the product depends on it:
// moving the hike displaces the museum, which collides with lunch, which pushes
// the drive into the dark — so after any patch, every day the patch touched is
// re-validated whole, never just the node that moved.

export type Author = "user" | "system" | "intervention";
export type { PlaceTier };

export type PlaceInfo = {
  tier: PlaceTier;
  openingHours: OpeningHours | null;
  lonLat: LonLat;
};

export type ValidationContext = {
  places: ReadonlyMap<string, PlaceInfo>;
  travel: TravelEstimator;
  author: Author;
};

export type Rule =
  | "overlap"
  | "travel"
  | "darkness"
  | "closed"
  | "tier"
  | "window"
  | "pace"
  | "hours-unknown";

export type Violation = {
  rule: Rule;
  severity: "error" | "warning";
  nodeIds: string[];
  /** YYYY-MM-DD, Tbilisi. */
  day: string;
  /** Shown in the diff, and fed back to the model when a generation retries. */
  message: string;
};

/** Legs longer than this need an explicit transfer node. */
export const IMPLICIT_LEG_MAX_MIN = 30;
/** Slack on top of travel time between consecutive stops: parking, paying, finding the door. */
export const LEG_BUFFER_MIN = 10;

/** Minutes of sightseeing and driving (meals and check-ins excluded) per pace. */
export const PACE_BUDGET_MIN: Record<Pace, number> = {
  relaxed: 4 * 60,
  moderate: 6 * 60,
  packed: 8 * 60,
};

// Generation may use verified places: hand-curation is optional, and a trip
// built from the verified tier beats no trip while the 600 are still being
// verified. Raw places stay user-only.
const allowedTiers: Record<Author, readonly PlaceTier[]> = {
  system: ["curated", "verified"],
  intervention: ["curated", "verified"],
  user: ["curated", "verified", "raw"],
};

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tbilisi",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const hhmm = (ms: number | Date) => clock.format(ms);
const title = (n: TripNode) => `"${n.meta.title}"`;

/**
 * The night's base at an instant: the latest stay that started at or before it.
 * A multi-night base is one stay node, so this looks back across days.
 */
function baseAt(sorted: NodeEntry[], instant: number): NodeEntry | undefined {
  let base: NodeEntry | undefined;
  for (const e of sorted) {
    if (Date.parse(e.node.startsAt) > instant) break;
    if (e.node.kind === "stay") base = e;
  }
  return base;
}

export function validateDay(
  doc: TripDoc,
  day: string,
  ctx: ValidationContext,
): Violation[] {
  const out: Violation[] = [];
  const add = (
    rule: Rule,
    nodeIds: string[],
    message: string,
    severity: Violation["severity"] = "error",
  ) => out.push({ rule, severity, nodeIds, day, message });

  const all = sortedNodes(doc.nodes);
  const today = all.filter((e) => dayKey(e.node.startsAt) === day);
  if (today.length === 0) return out;

  const where = (n: TripNode) => locate(n, ctx.places);

  // tier, hours, window, darkness: per node
  const tripStart = Date.parse(doc.trip.startsAt);
  const tripEnd = Date.parse(doc.trip.endsAt);
  for (const { id, node } of today) {
    const start = Date.parse(node.startsAt);
    const end = nodeEnd(node);
    const place = node.placeId ? ctx.places.get(node.placeId) : undefined;

    if (node.placeId && !place) {
      add(
        "tier",
        [id],
        `${title(node)} refers to a place that isn't in the catalogue`,
      );
    } else if (place && !allowedTiers[ctx.author].includes(place.tier)) {
      add(
        "tier",
        [id],
        `${title(node)} uses a ${place.tier} place; ${ctx.author} changes may only use ${allowedTiers[ctx.author].join(" or ")} places`,
      );
    } else if (
      !node.placeId &&
      ctx.author !== "user" &&
      (node.kind === "visit" || node.kind === "meal" || node.kind === "stay")
    ) {
      add("tier", [id], `${title(node)} has no catalogue place`);
    }

    if (place && (node.kind === "visit" || node.kind === "meal")) {
      if (place.openingHours === null) {
        add(
          "hours-unknown",
          [id],
          `Opening hours for ${title(node)} aren't known`,
          "warning",
        );
      } else if (
        !isOpenThroughout(place.openingHours, new Date(start), new Date(end))
      ) {
        add(
          "closed",
          [id],
          `${title(node)} isn't open for the whole of ${hhmm(start)}–${hhmm(end)}`,
        );
      }
    }

    if (start < tripStart || end > tripEnd) {
      add("window", [id], `${title(node)} falls outside the trip's dates`);
    }

    const outdoors =
      (node.kind === "visit" && !node.indoor) ||
      (node.kind === "transfer" && !node.meta.urban);
    const at = where(node);
    if (outdoors && at) {
      const sun = sunWindow(day, at, CIVIL);
      if (sun && start < sun.rise.getTime()) {
        add(
          "darkness",
          [id],
          `${title(node)} starts at ${hhmm(start)}, before first light at ${hhmm(sun.rise)}`,
        );
      } else if (sun && end > sun.set.getTime()) {
        add(
          "darkness",
          [id],
          `${title(node)} ends at ${hhmm(end)}, after dark (${hhmm(sun.set)})`,
        );
      }
    }
  }

  // overlap: every pair, not just neighbours, so one long node that swallows
  // two later ones is reported against both.
  for (let i = 0; i < today.length; i++) {
    const a = today[i];
    const aEnd = nodeEnd(a.node);
    for (let j = i + 1; j < today.length; j++) {
      const b = today[j];
      if (Date.parse(b.node.startsAt) >= aEnd) break;
      add(
        "overlap",
        [a.id, b.id],
        `${title(b.node)} starts at ${hhmm(Date.parse(b.node.startsAt))}, before ${title(a.node)} ends at ${hhmm(aEnd)}`,
      );
    }
  }

  // travel: walk the day from the morning's base to tonight's.
  const first = today[0];
  const morningBase =
    first.node.kind === "stay"
      ? undefined
      : baseAt(all, Date.parse(first.node.startsAt) - 1);
  let prev: { id: string; node: TripNode; timed: boolean } | undefined =
    morningBase && { ...morningBase, timed: false };

  for (const cur of today) {
    const from = prev && where(prev.node);
    const to = where(cur.node);
    if (prev && from && to) {
      const need = ctx.travel.minutes(from, to);
      if (cur.node.kind === "transfer") {
        // A transfer starts where you are and is the travel itself.
        if (cur.node.durationMin < need) {
          add(
            "travel",
            [cur.id],
            `${title(cur.node)} allows ${cur.node.durationMin} min for a drive of about ${need} min`,
          );
        }
      } else if (need > IMPLICIT_LEG_MAX_MIN) {
        add(
          "travel",
          [prev.id, cur.id],
          `Getting from ${title(prev.node)} to ${title(cur.node)} takes about ${need} min and needs a transfer`,
        );
      } else if (need > 0 && prev.timed) {
        const gap =
          (Date.parse(cur.node.startsAt) - nodeEnd(prev.node)) / 60_000;
        // A negative gap is already an overlap; don't report it twice.
        if (gap >= 0 && gap < need + LEG_BUFFER_MIN) {
          add(
            "travel",
            [prev.id, cur.id],
            `${Math.round(gap)} min between ${title(prev.node)} and ${title(cur.node)}, which are about ${need} min apart`,
          );
        }
      }
    }
    prev = { ...cur, timed: true };
  }

  const last = today[today.length - 1];
  if (last.node.kind !== "stay") {
    const tonight = baseAt(all, nodeEnd(last.node));
    const from = where(last.node);
    const to = tonight && where(tonight.node);
    if (tonight && from && to) {
      const need = ctx.travel.minutes(from, to);
      if (need > IMPLICIT_LEG_MAX_MIN) {
        add(
          "travel",
          [last.id, tonight.id],
          `Getting back from ${title(last.node)} to ${title(tonight.node)} takes about ${need} min and needs a transfer`,
        );
      }
    }
  }

  // pace
  const active = today
    .filter((e) => e.node.kind === "visit" || e.node.kind === "transfer")
    .reduce((sum, e) => sum + e.node.durationMin, 0);
  const budget = PACE_BUDGET_MIN[doc.trip.pace];
  if (active > budget) {
    add(
      "pace",
      today.map((e) => e.id),
      `${Math.round((active / 60) * 10) / 10}h of sightseeing and driving is a lot for a ${doc.trip.pace} pace (${budget / 60}h)`,
      "warning",
    );
  }

  return out;
}

export function validateDoc(doc: TripDoc, ctx: ValidationContext): Violation[] {
  return daysOf(doc).flatMap((day) => validateDay(doc, day, ctx));
}

/**
 * Days a change can have made incoherent: every day a touched node was on or is
 * now on. A stay is the base for every day after it until the next stay, so
 * touching one re-checks all later days; a trip-level change (dates, pace)
 * re-checks everything.
 */
export function affectedDays(
  before: TripDoc,
  after: TripDoc,
  change: Change,
): string[] {
  const all = new Set([...daysOf(before), ...daysOf(after)]);
  if (change.trip) return [...all].sort();

  const days = new Set<string>();
  let from: string | undefined;
  for (const id of change.nodes) {
    for (const node of [before.nodes[id], after.nodes[id]]) {
      if (!node) continue;
      const day = dayKey(node.startsAt);
      days.add(day);
      if (node.kind === "stay" && (from === undefined || day < from))
        from = day;
    }
  }
  if (from !== undefined) {
    for (const day of all) if (day > from) days.add(day);
  }
  return [...days].sort();
}

const violationKey = (v: Violation) =>
  `${v.rule}|${v.day}|${[...v.nodeIds].sort().join(",")}`;

/**
 * Violations in `after` that weren't already in `before`. Proposals are judged
 * on what they introduce, so the judge can still fix a day the traveller has
 * already overbooked.
 */
export function newViolations(
  before: Violation[],
  after: Violation[],
): Violation[] {
  const seen = new Set(before.map(violationKey));
  return after.filter((v) => !seen.has(violationKey(v)));
}

export type ProposalResult =
  | {
      ok: true;
      doc: TripDoc;
      inverse: PatchOp[];
      change: Change;
      /** Everything wrong on the affected days after the patch. */
      violations: Violation[];
      /** The part of `violations` this patch caused (warnings, for a user). */
      introduced: Violation[];
    }
  | { ok: false; kind: "invalid"; issues: string[] }
  | { ok: false; kind: "patch"; error: PatchError }
  | {
      ok: false;
      kind: "violations";
      violations: Violation[];
      introduced: Violation[];
      blocking: Violation[];
    };

/**
 * Would these ops leave every day they touch coherent? The judge (Phase 3), the
 * generator and the patch endpoint all go through this.
 *
 * System and intervention patches may not introduce any error. A traveller's own
 * edit is theirs to make: only a reference to a place outside what they may use
 * blocks it, and anything else it breaks comes back as a warning.
 */
export function validateProposal(
  doc: TripDoc,
  ops: unknown,
  ctx: ValidationContext,
): ProposalResult {
  const parsed = patchOps.safeParse(ops);
  if (!parsed.success) {
    return {
      ok: false,
      kind: "invalid",
      issues: parsed.error.issues.map(
        (i) => `${i.path.join("/")}: ${i.message}`,
      ),
    };
  }

  let applied: ReturnType<typeof applyOps>;
  try {
    applied = applyOps(doc, parsed.data);
  } catch (error) {
    if ((error as Error).name === "PatchError") {
      return { ok: false, kind: "patch", error: error as PatchError };
    }
    throw error;
  }

  const days = affectedDays(doc, applied.doc, applied.change);
  const before = days.flatMap((d) => validateDay(doc, d, ctx));
  const violations = days.flatMap((d) => validateDay(applied.doc, d, ctx));
  const introduced = newViolations(before, violations);
  const blocking = introduced.filter(
    (v) =>
      v.severity === "error" && (ctx.author !== "user" || v.rule === "tier"),
  );

  if (blocking.length > 0) {
    return { ok: false, kind: "violations", violations, introduced, blocking };
  }
  return {
    ok: true,
    doc: applied.doc,
    inverse: applied.inverse,
    change: applied.change,
    violations,
    introduced,
  };
}
