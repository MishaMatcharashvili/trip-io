import { type CorridorDef, corridors } from "./corridors.ts";

// What the corridors' seasonal risk says about one month: Explore's "roads
// this season", before there is a trip to watch. Seed knowledge, not
// measurement (corridors.ts) — so it is phrased as the season, never as a
// report of today's road.

export type RoadSeason = {
  slug: string;
  name: string;
  tone: "ok" | "alert";
  status: string;
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
    if (!worst) {
      return {
        slug: corridor.slug,
        name,
        tone: "ok",
        status: "No seasonal hazard this month",
      };
    }
    return {
      slug: corridor.slug,
      name,
      tone: worst.severity === "low" ? "ok" : "alert",
      status: `${hazardWords[worst.hazard] ?? worst.hazard} · ${worst.severity}`,
    };
  });
}
