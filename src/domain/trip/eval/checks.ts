import { haversineM, type LonLat } from "../../geo.ts";
import {
  dayKey,
  nodeEnd,
  sortedNodes,
  type TripDoc,
  type TripNode,
} from "../document.ts";
import type { Constraints } from "../generate/constraints.ts";
import { MAX_IDLE_MIN } from "../generate/idle.ts";
import { endpointOf } from "../generate/pipeline.ts";
import { weekdayOf } from "../generate/request.ts";
import type { Expectation, Scenario } from "./scenarios.ts";

// What a scenario's conversation and plan came out as, judged against what it
// should have: each expectation passes or fails with the evidence beside it,
// so a failure says what was got, not only that it was wrong. Pure: the runner
// (scripts/dev/planner-eval.ts) gathers the trace, this reads it.

export type PlaceFacts = { name: string; category: string; lonLat: LonLat };

export type Trace = {
  constraints: Constraints;
  /** The fields the traveller stated, as opposed to defaults. */
  said: readonly string[];
  /** The plan, or why there is none; null when the run did not build. */
  build:
    | { ok: true; doc: TripDoc }
    | { ok: false; explanations: string[] }
    | null;
  /** Where every catalogue place the plan uses is, by id. */
  places: Readonly<Record<string, PlaceFacts>>;
};

export type CheckResult = {
  kind: Expectation["kind"];
  pass: boolean;
  expected: string;
  got: string;
};

const clock = (ms: number) =>
  new Date(ms + 4 * 3_600_000).toISOString().slice(11, 16);

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type TimelineRow = {
  from: string;
  to: string;
  kind: TripNode["kind"];
  title: string;
  /** Minutes since the stop before it ended, the day's first excepted. */
  idleBefore: number | null;
  lonLat: LonLat | null;
};

export type TimelineDay = {
  date: string;
  weekday: string;
  rows: TimelineRow[];
  /** The longest stretch between two stops, beds left out. */
  longestIdle: number;
};

/** The plan day by day, with the empty stretches between stops measured. */
export function timeline(
  doc: TripDoc,
  places: Readonly<Record<string, PlaceFacts>>,
): TimelineDay[] {
  const days = new Map<string, TimelineDay>();
  let last: { day: string; end: number } | null = null;
  for (const { node } of sortedNodes(doc.nodes)) {
    const date = dayKey(node.startsAt);
    let day = days.get(date);
    if (!day) {
      day = {
        date,
        weekday: WEEKDAY[weekdayOf(date)],
        rows: [],
        longestIdle: 0,
      };
      days.set(date, day);
    }
    const starts = Date.parse(node.startsAt);
    const idleBefore =
      last && last.day === date && node.kind !== "stay"
        ? Math.round((starts - last.end) / 60_000)
        : null;
    if (idleBefore !== null) {
      day.longestIdle = Math.max(day.longestIdle, idleBefore);
    }
    day.rows.push({
      from: clock(starts),
      to: clock(nodeEnd(node)),
      kind: node.kind,
      title: node.meta.title,
      idleBefore,
      lonLat:
        node.lonLat ??
        (node.placeId ? places[node.placeId]?.lonLat : null) ??
        null,
    });
    if (node.kind !== "stay") last = { day: date, end: nodeEnd(node) };
  }
  return [...days.values()];
}

const list = (xs: readonly string[]) => (xs.length ? xs.join(", ") : "none");

function check(e: Expectation, trace: Trace): Omit<CheckResult, "kind"> {
  const c = trace.constraints;
  const doc = trace.build?.ok ? trace.build.doc : null;
  const needsPlan = (
    judge: (doc: TripDoc) => Omit<CheckResult, "kind" | "expected"> & {
      expected?: string;
    },
    expected: string,
  ) => {
    if (!doc) {
      return {
        pass: false,
        expected,
        got: trace.build
          ? `no plan: ${trace.build.ok ? "" : trace.build.explanations.join("; ")}`
          : "not built",
      };
    }
    return { expected, ...judge(doc) };
  };

  switch (e.kind) {
    case "days":
      return {
        pass: c.days === e.equals,
        expected: `${e.equals} days`,
        got: `${c.days} days`,
      };
    case "startWeekday":
      return {
        pass: weekdayOf(c.startDate) === e.is,
        expected: `starts on a ${WEEKDAY[e.is]}`,
        got: `${c.startDate}, a ${WEEKDAY[weekdayOf(c.startDate)]}${trace.said.includes("startDate") ? "" : " (assumed)"}`,
      };
    case "places": {
      const missing = (e.includes ?? []).filter((p) => !c.places.includes(p));
      const unwanted = (e.excludes ?? []).filter((p) => c.places.includes(p));
      return {
        pass: !missing.length && !unwanted.length,
        expected: [
          e.includes && `places include ${list(e.includes)}`,
          e.excludes && `exclude ${list(e.excludes)}`,
        ]
          .filter(Boolean)
          .join(", "),
        got: `places ${list(c.places)}`,
      };
    }
    case "start":
      return {
        pass: c.start === e.is,
        expected: `starts from ${e.is}`,
        got: `starts from ${c.start}${trace.said.includes("start") ? "" : " (default)"}`,
      };
    case "freeNights":
      return {
        pass: c.freeNights >= e.atLeast,
        expected: `at least ${e.atLeast} free nights`,
        got: `${c.freeNights} free nights`,
      };
    case "notes":
      return {
        pass: c.notes.toLowerCase().includes(e.mention.toLowerCase()),
        expected: `notes mention "${e.mention}"`,
        got: `notes: "${c.notes}"`,
      };
    case "interests": {
      const missing = e.includes.filter(
        (i) => !(c.interests as string[]).includes(i),
      );
      return {
        pass: !missing.length,
        expected: `interests include ${list(e.includes)}`,
        got: `interests ${list(c.interests)}`,
      };
    }
    case "dayEnds":
      return {
        pass: c.dayEnds === e.is,
        expected: `days end at ${e.is}`,
        got: `days end at ${c.dayEnds}`,
      };
    case "built":
      return needsPlan(
        (d) => ({
          pass: true,
          got: `${Object.keys(d.nodes).length} nodes`,
        }),
        "a plan",
      );
    case "calendarDays":
      return needsPlan((d) => {
        const days = new Set(
          Object.values(d.nodes).map((n) => dayKey(n.startsAt)),
        );
        return {
          pass: days.size === e.equals,
          got: `${days.size} days: ${[...days]
            .sort()
            .map((x) => `${WEEKDAY[weekdayOf(x)]} ${x}`)
            .join(", ")}`,
        };
      }, `${e.equals} calendar days in the plan`);
    case "near":
      return needsPlan((d) => {
        const far = Object.values(d.nodes).flatMap((n) => {
          if (n.kind === "transfer" || n.meta.rest || !n.placeId) return [];
          const at = trace.places[n.placeId]?.lonLat;
          if (!at) return [];
          const km = haversineM(at, e.at) / 1000;
          return km > e.withinKm
            ? [`${n.meta.title} (${Math.round(km)} km)`]
            : [];
        });
        return {
          pass: far.length === 0,
          got: far.length ? `too far: ${far.join("; ")}` : "all within",
        };
      }, `every stop within ${e.withinKm} km of ${e.name}`);
    case "noLodging":
      return needsPlan((d) => {
        const beds = Object.values(d.nodes)
          .filter((n) => n.kind === "stay" && !n.meta.home)
          .map((n) => n.meta.title);
        return {
          pass: beds.length === 0,
          got: beds.length ? list(beds) : "no hotel",
        };
      }, "no hotel");
    case "homeAt": {
      const km = (at: LonLat) => haversineM(at, e.at) / 1000;
      const held = c.home
        ? `home ${c.home.name} in ${c.home.place}, ${km(c.home.lonLat).toFixed(1)} km from ${e.name}`
        : "no home";
      if (!c.home || km(c.home.lonLat) > e.withinKm) {
        return { pass: false, expected: `a home at ${e.name}`, got: held };
      }
      return needsPlan((d) => {
        const stays = Object.values(d.nodes).filter((n) => n.kind === "stay");
        const away = stays.filter(
          (n) => !n.meta.home || !n.lonLat || km(n.lonLat) > e.withinKm,
        );
        return {
          pass: stays.length > 0 && away.length === 0,
          got: `${held}; ${
            stays.length
              ? away.length
                ? `nights away: ${list(away.map((n) => n.meta.title))}`
                : `nights at ${list(stays.map((n) => n.meta.title))}`
              : "no night at it"
          }`,
        };
      }, `a home at ${e.name}, and every night there`);
    }
    case "endpointsAt": {
      const pins = [c.start, c.finish].map((slug) => endpointOf(c, slug));
      const off = pins.filter(
        (p) =>
          !p ||
          p.name !== e.name ||
          haversineM(p.lonLat, e.at) / 1000 > e.withinKm,
      );
      return {
        pass: off.length === 0,
        expected: `start and finish pinned at ${e.name}`,
        got: pins
          .map((p) =>
            p
              ? `${p.name} (${(haversineM(p.lonLat, e.at) / 1000).toFixed(1)} km away)`
              : "nowhere",
          )
          .join(" → "),
      };
    }
    case "maxIdle": {
      const limit = e.minutes ?? MAX_IDLE_MIN[c.pace];
      return needsPlan((d) => {
        const holes = timeline(d, trace.places).flatMap((day) =>
          day.rows
            .filter((r) => (r.idleBefore ?? 0) > limit)
            .map(
              (r) =>
                `${day.weekday} ${day.date} ${r.idleBefore} min before ${r.from} ${r.title}`,
            ),
        );
        return {
          pass: holes.length === 0,
          got: holes.length ? holes.join("; ") : "no gap over it",
        };
      }, `no gap over ${limit} min (${c.pace})`);
    }
    case "noRepeats":
      return needsPlan((d) => {
        const days = new Map<string, Set<string>>();
        for (const n of Object.values(d.nodes)) {
          if (n.kind !== "visit" || n.meta.rest || !n.placeId) continue;
          const seen = days.get(n.meta.title) ?? new Set();
          seen.add(dayKey(n.startsAt));
          days.set(n.meta.title, seen);
        }
        const repeated = [...days]
          .filter(([, on]) => on.size > 1)
          .map(([title, on]) => `${title} (${on.size} days)`);
        return {
          pass: repeated.length === 0,
          got: repeated.length ? list(repeated) : "each sight once",
        };
      }, "no sight on two days");
    case "homeBy":
      return needsPlan((d) => {
        const lastNode = sortedNodes(d.nodes).at(-1)?.node;
        if (!lastNode) return { pass: false, got: "no stops" };
        const end = nodeEnd(lastNode);
        const day = dayKey(end);
        return {
          pass: clock(end) <= e.time,
          got: `last stop "${lastNode.meta.title}" ends ${WEEKDAY[weekdayOf(day)]} ${day} ${clock(end)}`,
        };
      }, `home by ${e.time} on the last day`);
  }
}

export function score(scenario: Scenario, trace: Trace): CheckResult[] {
  return scenario.expect.map((e) => ({ kind: e.kind, ...check(e, trace) }));
}
