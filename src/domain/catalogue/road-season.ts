import { type CorridorDef, corridors } from "./corridors.ts";
import type { FocusAreaSlug } from "./focus-areas.ts";

// What the corridors' seasonal risk says about one month: Explore's "roads
// this season", before there is a trip to watch. Seed knowledge, not
// measurement (corridors.ts) — so it is phrased as the season, never as a
// report of today's road.

export type RoadSeason = {
  slug: string;
  name: string;
  tone: "ok" | "alert";
  status: string;
  /** The Explore regions this road is the way to, or out of. */
  areas: FocusAreaSlug[];
};

// A road that runs through a region, or leaves from it for somewhere else the
// traveller is likely to be going. Roads in none of the four regions are shown
// only when no region is chosen.
const roadAreas: Record<string, FocusAreaSlug[]> = {
  "military-road": ["tbilisi-core", "kazbegi-corridor"],
  "gombori-pass": ["tbilisi-core", "kakheti"],
  "kakheti-highway": ["tbilisi-core", "kakheti"],
  "east-west-highway": ["tbilisi-core"],
  "svaneti-road": ["svaneti"],
  "mestia-ushguli": ["svaneti"],
  "zagari-pass": ["svaneti"],
  tusheti: ["kakheti"],
};

const rank = { low: 0, moderate: 1, high: 2 } as const;

const hazardWords: Record<string, string> = {
  avalanche: "avalanche risk",
  "snow-closure": "closes after heavy snow",
  ice: "ice on the road",
  landslide: "landslide risk",
  mudflow: "mudflow season",
  rockfall: "rockfall risk",
  flood: "flood risk",
  fog: "fog some mornings",
};

/** Each corridor's worst seasonal hazard in a month (1–12), or none. */
export function roadSeason(
  month: number,
  list: readonly CorridorDef[] = corridors,
): RoadSeason[] {
  return list.map((corridor) => {
    const active = corridor.seasonRisk
      .filter((r) => r.months.includes(month))
      .sort((a, b) => rank[b.severity] - rank[a.severity]);
    const worst = active[0];
    const name = corridor.name.replace(/\s*\(.*\)$/, "");
    const areas = roadAreas[corridor.slug] ?? [];
    if (!worst) {
      return {
        slug: corridor.slug,
        name,
        areas,
        tone: "ok",
        status: "No seasonal hazard this month",
      };
    }
    return {
      slug: corridor.slug,
      name,
      areas,
      tone: worst.severity === "low" ? "ok" : "alert",
      status: `${hazardWords[worst.hazard] ?? worst.hazard} · ${worst.severity}`,
    };
  });
}
