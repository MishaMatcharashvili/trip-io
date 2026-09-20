import { z } from "zod";
import type { CategoryGroup } from "../../catalogue/categories.ts";
import type { FocusAreaSlug } from "../../catalogue/focus-areas.ts";
import type { OpeningHours } from "../../catalogue/opening-hours.ts";
import type { PlaceTier } from "../../catalogue/tier.ts";
import type { LonLat } from "../../geo.ts";

// The untimed plan: which places, on which day, in what order and roughly when.
// It is what the model produces, what the fallback produces, and what the
// warm-start cache stores. Clock times are assigned by `schedule.ts` — models are
// weak at time arithmetic and good at choosing and ordering places, so each side
// does the part it is good at.

export const slots = ["morning", "midday", "afternoon", "evening"] as const;
export type Slot = (typeof slots)[number];

/**
 * The shape the model fills in. `ref` points into the candidate list sent with
 * the prompt ("p17"); `refSchema` narrows it to exactly those refs per request.
 */
export function planSchema(refSchema: z.ZodType<string> = z.string()) {
  const stop = z.object({
    ref: refSchema,
    slot: z.enum(slots),
    kind: z.enum(["visit", "meal"]),
    durationMin: z.number().int().min(15).max(480),
  });
  return z.object({
    days: z
      .array(
        z.object({
          day: z.number().int().min(1),
          theme: z.string().max(120),
          stayRef: refSchema.nullable(),
          stops: z.array(stop).max(8),
        }),
      )
      .min(1),
  });
}
export type RefPlan = z.infer<ReturnType<typeof planSchema>>;

export type PlanStop = {
  placeId: string;
  slot: Slot;
  kind: "visit" | "meal";
  durationMin: number;
};
export type PlanDay = {
  day: number;
  theme: string;
  stayId: string | null;
  stops: PlanStop[];
};
/** A plan with refs resolved to catalogue place ids. */
export type Plan = { days: PlanDay[] };

/**
 * Resolves refs to place ids. Any ref not in the candidate list is invented —
 * the model named a place it was never given — and is reported, not dropped:
 * the pipeline rejects the whole plan and retries with the list as feedback.
 */
export function resolveRefs(
  plan: RefPlan,
  refs: ReadonlyMap<string, string>,
): { plan: Plan; invented: string[] } {
  const invented = new Set<string>();
  const resolve = (ref: string) => {
    const id = refs.get(ref);
    if (id === undefined) invented.add(ref);
    return id ?? "";
  };
  const resolved: Plan = {
    days: plan.days.map((d) => ({
      day: d.day,
      theme: d.theme,
      stayId: d.stayRef === null ? null : resolve(d.stayRef),
      stops: d.stops.map((s) => ({
        placeId: resolve(s.ref),
        slot: s.slot,
        kind: s.kind,
        durationMin: s.durationMin,
      })),
    })),
  };
  return { plan: resolved, invented: [...invented] };
}

/** What planning needs to know about a candidate place. */
export type Candidate = {
  id: string;
  name: string;
  category: string;
  group: CategoryGroup;
  tier: PlaceTier;
  lonLat: LonLat;
  openingHours: OpeningHours | null;
  /** Visited in the open: bound by daylight. */
  outdoor: boolean;
  /** The focus area it was retrieved for; the fallback plans one area at a time. */
  area: FocusAreaSlug;
};
