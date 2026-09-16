// Where the 600 hand-verified `curated` places come from (build-plan Phase 1).
// Targets are a starting split, not a contract. If verification slips, cut
// coverage (lower a target) rather than lowering the bar
// (docs/implementation-plan.md §12).

export type AreaMatch =
  | { kind: "bbox"; west: number; south: number; east: number; north: number }
  | {
      kind: "regions";
      slugs: string[];
      nearCorridor?: { slug: string; withinM: number };
    }
  | { kind: "isoRegion"; code: string };

export type FocusArea = {
  slug: string;
  name: string;
  target: number;
  match: AreaMatch;
};

export const focusAreas = [
  {
    slug: "tbilisi-core",
    name: "Tbilisi core",
    target: 250,
    // Old Town, Sololaki, Mtatsminda, Vera, Vake, Chugureti, Marjanishvili.
    match: {
      kind: "bbox",
      west: 44.74,
      south: 41.68,
      east: 44.83,
      north: 41.735,
    },
  },
  {
    slug: "kazbegi-corridor",
    name: "Kazbegi corridor",
    target: 100,
    // Mtskheta to the Larsi border, staying close to the Military Road rather
    // than taking all of Dusheti municipality (which reaches Khevsureti).
    match: {
      kind: "regions",
      slugs: ["mtskheta", "dusheti", "kazbegi"],
      nearCorridor: { slug: "military-road", withinM: 10_000 },
    },
  },
  {
    slug: "kakheti",
    name: "Kakheti",
    target: 150,
    match: { kind: "isoRegion", code: "GE-KA" },
  },
  {
    slug: "svaneti",
    name: "Svaneti",
    target: 100,
    // Upper (Mestia) and Lower (Lentekhi) Svaneti.
    match: { kind: "regions", slugs: ["mestia", "lentekhi"] },
  },
] as const satisfies readonly FocusArea[];

export type FocusAreaSlug = (typeof focusAreas)[number]["slug"];

export const focusAreaSlugs = focusAreas.map((a) => a.slug) as [
  FocusAreaSlug,
  ...FocusAreaSlug[],
];

export const curatedTarget = focusAreas.reduce((sum, a) => sum + a.target, 0);
