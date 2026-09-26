import type { FocusAreaSlug } from "../../catalogue/focus-areas.ts";
import { haversineM, type LonLat } from "../../geo.ts";
import type { Pace } from "../document.ts";
import type { Constraints } from "./constraints.ts";
import type { Candidate, Plan, PlanDay, PlanStop, Slot } from "./plan.ts";

// The plan of last resort, when the model has failed twice. No model, no
// hand-authored templates (curated place ids differ between databases): a
// deterministic greedy plan over the same curated candidates, in a fixed day
// shape. It is plain, and it is always true — it goes through the same
// scheduler and validator as a model plan. The pipeline calls it again with the
// offending places excluded until it validates, or there's nothing left.

const DAY_SHAPE: Record<Pace, [Slot, PlanStop["kind"]][]> = {
  relaxed: [
    ["morning", "visit"],
    ["midday", "meal"],
    ["afternoon", "visit"],
    ["evening", "meal"],
  ],
  moderate: [
    ["morning", "visit"],
    ["morning", "visit"],
    ["midday", "meal"],
    ["afternoon", "visit"],
    ["evening", "meal"],
  ],
  packed: [
    ["morning", "visit"],
    ["morning", "visit"],
    ["midday", "meal"],
    ["afternoon", "visit"],
    ["afternoon", "visit"],
    ["evening", "meal"],
  ],
};

const VISIT_MINUTES: Partial<Record<Candidate["group"], number>> = {
  heritage: 60,
  culture: 90,
  nature: 150,
};
const MEAL_MINUTES: Partial<Record<Slot, number>> = {
  morning: 45,
  midday: 75,
  evening: 90,
};

/**
 * A visit longer than this ends its slot. The moderate and packed shapes put
 * two visits in the morning, and a 150-minute walk from 09:00 leaves the second
 * nowhere to start before noon: the scheduler rejects it, the pipeline drops
 * that second place and tries again, and every round fails the same way.
 */
const LONG_VISIT_MIN = 90;

/** A stay is judged by how much there is to do within this radius of it. */
const STAY_RADIUS_M = 15_000;

const byId = (a: Candidate, b: Candidate) => (a.id < b.id ? -1 : 1);

/**
 * Days per area, in the traveller's order, in proportion to how much there is
 * to see in each (every area gets a day when there are enough days).
 */
export function splitDays(
  days: number,
  areas: FocusAreaSlug[],
  weight: (area: FocusAreaSlug) => number,
): FocusAreaSlug[] {
  const used = areas.slice(0, days);
  const total = used.reduce((s, a) => s + Math.max(1, weight(a)), 0);
  const counts = used.map(
    (a) => 1 + (Math.max(1, weight(a)) / total) * (days - used.length),
  );
  const whole = counts.map(Math.floor);
  // Hand out the remainder by largest fractional part.
  let left = days - whole.reduce((s, n) => s + n, 0);
  const order = counts
    .map((c, i) => [c - Math.floor(c), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) {
    if (left-- <= 0) break;
    whole[i]++;
  }
  return used.flatMap((a, i) => Array<FocusAreaSlug>(whole[i]).fill(a));
}

export function fallbackPlan(
  c: Pick<Constraints, "days" | "areas" | "pace" | "interests">,
  candidates: readonly Candidate[],
  exclude: ReadonlySet<string> = new Set(),
): Plan {
  const pool = candidates.filter((p) => !exclude.has(p.id)).sort(byId);
  const visitable = (p: Candidate) => VISIT_MINUTES[p.group] !== undefined;
  const liked = (p: Candidate) =>
    c.interests.length === 0 ||
    (c.interests as readonly string[]).includes(p.group);

  const inArea = (area: FocusAreaSlug) => pool.filter((p) => p.area === area);
  const dayAreas = splitDays(
    c.days,
    c.areas,
    (a) => inArea(a).filter(visitable).length,
  );

  const stayFor = new Map<FocusAreaSlug, Candidate | undefined>();
  for (const area of new Set(dayAreas)) {
    const things = inArea(area).filter((p) => p.group !== "lodging");
    const score = (s: Candidate) =>
      things.filter((t) => haversineM(s.lonLat, t.lonLat) < STAY_RADIUS_M)
        .length;
    stayFor.set(
      area,
      inArea(area)
        .filter((p) => p.group === "lodging")
        .sort((a, b) => score(b) - score(a) || byId(a, b))[0],
    );
  }

  const usedVisits = new Set<string>();
  const usedMeals = new Set<string>();
  const nearest = (
    from: LonLat | null,
    options: Candidate[],
    rank: (p: Candidate) => number,
  ) =>
    options.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (from ? haversineM(from, a.lonLat) - haversineM(from, b.lonLat) : 0) ||
        byId(a, b),
    )[0];

  const days: PlanDay[] = dayAreas.map((area, i) => {
    const stay = stayFor.get(area);
    let here: LonLat | null = stay?.lonLat ?? null;
    const stops: PlanStop[] = [];
    const shape = DAY_SHAPE[c.pace];

    for (const [index, [slot, kind]] of shape.entries()) {
      const previous = stops.at(-1);
      if (
        kind === "visit" &&
        previous?.kind === "visit" &&
        previous.slot === slot &&
        previous.durationMin > LONG_VISIT_MIN
      ) {
        continue;
      }
      // Another visit to come in this slot: a short one now keeps room for it.
      const moreInSlot = shape
        .slice(index + 1)
        .some(([s, k]) => s === slot && k === "visit");
      const long = (p: Candidate) =>
        (VISIT_MINUTES[p.group] ?? 0) > LONG_VISIT_MIN;

      const pick =
        kind === "visit"
          ? nearest(
              here,
              inArea(area).filter((p) => visitable(p) && !usedVisits.has(p.id)),
              (p) => (liked(p) ? 0 : 2) + (moreInSlot && long(p) ? 1 : 0),
            )
          : nearest(
              here,
              inArea(area).filter((p) => p.group === "food"),
              // A good restaurant can come round again, but prefer a new one.
              (p) => (usedMeals.has(p.id) ? 1 : 0),
            );
      if (!pick) continue;
      (kind === "visit" ? usedVisits : usedMeals).add(pick.id);
      stops.push({
        placeId: pick.id,
        slot,
        kind,
        durationMin:
          kind === "visit"
            ? (VISIT_MINUTES[pick.group] as number)
            : (MEAL_MINUTES[slot] ?? 60),
      });
      here = pick.lonLat;
    }

    return {
      day: i + 1,
      theme: `${area} (fallback)`,
      stayId: stay?.id ?? null,
      stops,
    };
  });

  return { days };
}
