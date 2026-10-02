import {
  type PlaceHit,
  placeCards,
  placeFacts,
  searchPlaces,
} from "../dal/places.ts";
import { countUse } from "../dal/usage.ts";
import {
  type CategoryGroup,
  categoryGroup,
  isAllowedCategory,
} from "../domain/catalogue/categories.ts";
import type { LonLat } from "../domain/geo.ts";
import { placeIdsOf, type TripDoc } from "../domain/trip/document.ts";
import type { PatchOp } from "../domain/trip/patch.ts";
import {
  describeStop,
  draftSuggestions,
  rankForWish,
  readPicks,
  type Suggester,
  type SuggestionDraft,
  type SuggestionKind,
  type SwapCandidate,
} from "../domain/trip/suggest.ts";
import { straightLineTravel } from "../domain/trip/travel.ts";
import type { PlaceInfo } from "../domain/trip/validate.ts";
import { at } from "../domain/watch/briefing.ts";
import { suggestWithOpenAI } from "../infra/openai-suggest.ts";
import { tripView } from "./trip-document.ts";
import { dayForecast, type ForecastHour } from "./trip-screen.ts";

// Suggested changes to one stop. Read-only: it proposes and the traveller
// applies one through the ordinary patch route, as they would an edit of their
// own, so nothing here writes and nothing is ever applied for them.
//
// The order: the rules build every sound option (src/domain/trip/suggest.ts);
// a model, when there is one, chooses among them and says why; and when there is
// not, or it fails, or it answers with nothing usable, the rules' own best three
// are shown in the rules' own words. The traveller is told which it was, so a
// plain list is never passed off as more than it is.

export type SuggestLimits = { userPerMinute: number; userPerDay: number };
export const defaultLimits: SuggestLimits = {
  userPerMinute: 6,
  userPerDay: 60,
};

export type SuggestionView = {
  id: string;
  kind: SuggestionKind;
  title: string;
  reason: string;
  /** What changes on this stop. */
  changes: string[];
  /** What it moves besides. */
  moves: string[];
  /** Applied through the patch route, as one change. */
  ops: PatchOp[];
};

export type SuggestOutcome =
  | { ok: true; source: "ai" | "rules"; suggestions: SuggestionView[] }
  | { ok: false; reason: "not-found" | "no-such-stop" | "rate-limited" };

export type SuggestDeps = {
  trip: (tripId: string) => Promise<{ doc: TripDoc } | null>;
  cards: (
    ids: string[],
  ) => Promise<Map<string, { category: string; lonLat: LonLat }>>;
  facts: (ids: string[]) => Promise<Map<string, PlaceInfo>>;
  search: (query: {
    near: LonLat;
    group: CategoryGroup;
    limit: number;
  }) => Promise<PlaceHit[]>;
  forecast: (point: LonLat, date: string) => Promise<ForecastHour[] | null>;
  count: (key: string, windowSeconds: number, now: Date) => Promise<number>;
  /** Absent: no model is configured, and the rules answer alone. */
  suggester: Suggester | undefined;
  now: () => Date;
  limits: SuggestLimits;
};

const defaults = (): SuggestDeps => ({
  trip: tripView,
  cards: (ids) => placeCards(ids),
  facts: (ids) => placeFacts(ids),
  search: ({ near, group, limit }) =>
    searchPlaces({ near, groups: [group], limit }),
  forecast: dayForecast,
  count: countUse,
  suggester: process.env.OPENAI_API_KEY ? suggestWithOpenAI : undefined,
  now: () => new Date(),
  limits: defaultLimits,
});

const view = (d: SuggestionDraft, reason = d.reason): SuggestionView => ({
  id: d.id,
  kind: d.kind,
  title: d.title,
  reason,
  changes: d.changes,
  moves: d.moves,
  ops: d.ops,
});

/** Rain worth planning around, in mm in the hour. */
const WET_MM = 0.2;

const MINUTE = 60;
const DAY = 86_400;

export async function suggestForStop(
  tripId: string,
  userId: string,
  nodeId: string,
  wish: string | null,
  overrides: Partial<SuggestDeps> = {},
): Promise<SuggestOutcome> {
  const deps = { ...defaults(), ...overrides };
  const now = deps.now();

  // Each call may reach a model, the weather and the catalogue: counted whether
  // or not it does, so a script cannot find out which are free.
  if (
    (await deps.count(`suggest:user:${userId}:m`, MINUTE, now)) >
      deps.limits.userPerMinute ||
    (await deps.count(`suggest:user:${userId}:d`, DAY, now)) >
      deps.limits.userPerDay
  ) {
    return { ok: false, reason: "rate-limited" };
  }

  const trip = await deps.trip(tripId);
  if (!trip) return { ok: false, reason: "not-found" };
  const node = trip.doc.nodes[nodeId];
  if (!node) return { ok: false, reason: "no-such-stop" };

  const ids = placeIdsOf(trip.doc);
  const [cards, facts] = await Promise.all([deps.cards(ids), deps.facts(ids)]);
  const here = node.placeId ? cards.get(node.placeId) : undefined;
  const spot = here?.lonLat ?? node.lonLat;

  // Other places of the same kind near it, for swapping in. Each needs its own
  // facts (hours, tier) for the rules to hold it to the day.
  let candidates: SwapCandidate[] = [];
  const group =
    here && isAllowedCategory(here.category)
      ? categoryGroup[here.category]
      : undefined;
  if (spot && group && (node.kind === "visit" || node.kind === "meal")) {
    const hits = await deps.search({ near: spot as LonLat, group, limit: 12 });
    const found = hits.filter((h) => h.id !== node.placeId);
    const more = await deps.facts(found.map((h) => h.id));
    for (const [id, info] of more) facts.set(id, info);
    candidates = found.map((h) => ({
      id: h.id,
      name: h.name,
      category: h.category,
      group: h.group,
      tier: h.tier,
      lonLat: h.lonLat,
      outdoor: h.outdoor,
      distanceM: h.distanceM,
    }));
  }

  // The weather on the day, if it is known: the forecast is a convenience, and
  // its absence only means no option is chosen for the rain.
  let wet: Set<number> | undefined;
  if (spot) {
    const forecast = await deps
      .forecast(spot as LonLat, tripDay(node.startsAt))
      .catch(() => null);
    if (forecast) {
      wet = new Set(
        forecast
          .filter((h) => h.precipitation >= WET_MM)
          .map((h) => Number(at(h.at).slice(0, 2))),
      );
    }
  }

  const drafts = draftSuggestions(trip.doc, nodeId, candidates, {
    places: facts,
    travel: straightLineTravel,
    categories: new Map([...cards].map(([id, c]) => [id, c.category])),
    wet,
  });
  if (drafts.length === 0)
    return { ok: true, source: "rules", suggestions: [] };

  const ranked = rankForWish(drafts, wish);

  if (deps.suggester) {
    try {
      const picks = readPicks(
        await deps.suggester({
          context: describeStop(trip.doc, nodeId),
          wish,
          options: ranked.map((d) => ({ id: d.id, facts: d.facts })),
        }),
        new Set(ranked.map((d) => d.id)),
      );
      if (picks && picks.length > 0) {
        const byId = new Map(ranked.map((d) => [d.id, d]));
        return {
          ok: true,
          source: "ai",
          suggestions: picks.flatMap((p) => {
            const draft = byId.get(p.id);
            return draft ? [view(draft, p.reason)] : [];
          }),
        };
      }
    } catch {
      // A model that is down or answers badly does not cost the traveller their
      // suggestions: the rules' own are below.
    }
  }

  return {
    ok: true,
    source: "rules",
    suggestions: ranked.slice(0, 3).map((d) => view(d)),
  };
}

/** The Tbilisi calendar day of an instant. */
function tripDay(instant: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
