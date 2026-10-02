import type { OpeningHours } from "../domain/catalogue/opening-hours.ts";
import type { LonLat } from "../domain/geo.ts";
import {
  dayKey,
  locate,
  nodeEnd,
  sortedNodes,
  type TripDoc,
} from "../domain/trip/document.ts";
import type { PatchOp } from "../domain/trip/patch.ts";
import { retime } from "../domain/trip/retime.ts";
import { straightLineTravel } from "../domain/trip/travel.ts";
import {
  isTimeProblem,
  LEG_BUFFER_MIN,
  type PlaceInfo,
  type Rule,
  validateDoc,
} from "../domain/trip/validate.ts";
import { at } from "../domain/watch/briefing.ts";
import { duration } from "./trip-model.ts";

// How a day's times hang together, as the editor shows it: what is wrong, each
// with the shift that would put it right, and how much room there is between one
// stop and the next. Pure — a document and its places in, plain values out — so
// it is the same read for the server render and for a test.

const MIN = 60_000;

export type Gap = { text: string; tone: "ok" | "alert" } | null;

/**
 * What to say between two stops. `slackMin` is the time between the first's end
 * and the second's start (negative when they overlap); `needMin` is the way
 * between them. The wording says the numbers: a warning that does not is one
 * more thing to go and work out.
 */
export function gapNote({
  slackMin,
  needMin,
}: {
  slackMin: number;
  needMin: number;
}): Gap {
  if (slackMin < 0) {
    return { text: `Overlaps by ${duration(-slackMin)}`, tone: "alert" };
  }
  if (needMin === 0) return null;
  if (slackMin < needMin + LEG_BUFFER_MIN) {
    return {
      text: `About ${duration(needMin)} away · only ${duration(slackMin)} between`,
      tone: "alert",
    };
  }
  return { text: `About ${duration(needMin)} away`, tone: "ok" };
}

export type ProblemView = {
  /** Stable across renders: the rule and the stops it names. */
  id: string;
  rule: Rule;
  severity: "error" | "warning";
  message: string;
  /** The shift that puts it right, when shifting later stops can. */
  fix: {
    label: string;
    ops: PatchOp[];
    /** What it moves, as "Lunch 12:30 → 13:00", for the traveller to read first. */
    moves: string[];
  } | null;
};

export type DayTiming = {
  /** Time problems by day (YYYY-MM-DD, Tbilisi). */
  problems: Map<string, ProblemView[]>;
  /** The note before a stop, keyed by that stop's id. */
  gaps: Record<string, Gap>;
};

type PlaceFacts = {
  tier: PlaceInfo["tier"];
  openingHours: OpeningHours | null;
  lonLat: LonLat;
};

export function dayTiming(
  doc: TripDoc,
  placeFacts: ReadonlyMap<string, PlaceFacts> | Record<string, PlaceFacts>,
): DayTiming {
  const places: ReadonlyMap<string, PlaceInfo> =
    placeFacts instanceof Map
      ? placeFacts
      : new Map(Object.entries(placeFacts));
  const ctx = { places, travel: straightLineTravel };

  const problems = new Map<string, ProblemView[]>();
  for (const v of validateDoc(doc, { ...ctx, author: "user" })) {
    if (!isTimeProblem(v)) continue;

    // The stops a shift can help are the later ones: for a clash between two,
    // everything from the first on is pushed clear.
    let fix: ProblemView["fix"] = null;
    if ((v.rule === "overlap" || v.rule === "travel") && v.nodeIds[0]) {
      const out = retime(doc, v.nodeIds[0], {}, ctx);
      if (!out.overflow && out.pushed.length > 0) {
        fix = {
          label: `Shift ${out.pushed.length} later stop${out.pushed.length === 1 ? "" : "s"}`,
          ops: out.ops,
          moves: out.pushed.map(
            (p) => `${p.title} ${at(p.from)} → ${at(p.to)}`,
          ),
        };
      }
    }
    const list = problems.get(v.day) ?? [];
    list.push({
      id: `${v.rule}:${v.nodeIds.join(",")}`,
      rule: v.rule,
      severity: v.severity,
      message: v.message,
      fix,
    });
    problems.set(v.day, list);
  }

  // The room between each stop and the one before it, within a day.
  const gaps: Record<string, Gap> = {};
  let prev: { end: number; at: LonLat | null; day: string } | null = null;
  for (const { id, node } of sortedNodes(doc.nodes)) {
    const day = dayKey(node.startsAt);
    const here = locate(node, places);
    if (prev && prev.day === day && node.kind !== "transfer") {
      const need =
        prev.at && here ? straightLineTravel.minutes(prev.at, here) : 0;
      gaps[id] = gapNote({
        slackMin: Math.round((Date.parse(node.startsAt) - prev.end) / MIN),
        needMin: need,
      });
    }
    prev = { end: nodeEnd(node), at: here, day };
  }
  return { problems, gaps };
}
