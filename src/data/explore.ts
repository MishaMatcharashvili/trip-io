/**
 * Fixtures for Explore and Saved.
 *
 * The canvas leaves both screens undesigned, so these follow the catalogue the
 * pipeline actually produces: regions are the curation focus areas
 * (`src/core/catalogue/focus-areas.ts`), groups are the gate's category groups
 * (`categories.ts`), and road notes come from the corridor season-risk table
 * (`corridors.ts`). A place here is a `curated` catalogue row, which is why
 * each one says what was last verified.
 */

import type { Tone } from "@/ui/cx";

export type PlaceGroup = "heritage" | "nature" | "food" | "culture" | "lodging";

export type ExploreRegion = {
  slug: string;
  name: string;
  /** Curated places live in this region right now. */
  curated: number;
  blurb: string;
};

export type ExplorePlace = {
  id: string;
  name: string;
  region: string;
  group: PlaceGroup;
  summary: string;
  /** Duration, distance or price — the line a planner needs. */
  detail: string;
  /** What the watch layer last confirmed about it. */
  verified: string;
  /** Set when something seasonal or scheduled matters now. */
  note?: { tone: Tone; text: string };
};

export type RoadSeason = {
  slug: string;
  name: string;
  tone: Tone;
  status: string;
};

export const groupLabels: Record<PlaceGroup, string> = {
  heritage: "Heritage",
  nature: "Nature",
  food: "Food & wine",
  culture: "Culture",
  lodging: "Stay",
};

export const regions: ExploreRegion[] = [
  {
    slug: "tbilisi-core",
    name: "Tbilisi",
    curated: 214,
    blurb: "Old Town, Sololaki, Vera and Vake",
  },
  {
    slug: "kazbegi-corridor",
    name: "Kazbegi",
    curated: 88,
    blurb: "Along the Military Road to Stepantsminda",
  },
  {
    slug: "kakheti",
    name: "Kakheti",
    curated: 97,
    blurb: "Wine country, Sighnaghi to Telavi",
  },
  {
    slug: "svaneti",
    name: "Svaneti",
    curated: 61,
    blurb: "Mestia, Ushguli and the high valleys",
  },
];

export const places: ExplorePlace[] = [
  {
    id: "gergeti",
    name: "Gergeti Trinity Church",
    region: "kazbegi-corridor",
    group: "heritage",
    summary: "14th-century church on a spur above Stepantsminda, at 2,170 m.",
    detail: "2h 40m round trip · 400 m ascent",
    verified: "Hours verified 2 h ago",
  },
  {
    id: "juta",
    name: "Juta valley walk",
    region: "kazbegi-corridor",
    group: "nature",
    summary: "Flat meadow trail under the Chaukhi massif.",
    detail: "3h · easy · 11 km",
    verified: "Trail clear · 1 d ago",
    note: { tone: "ok", text: "Best month for it — dry and clear" },
  },
  {
    id: "truso",
    name: "Truso valley",
    region: "kazbegi-corridor",
    group: "nature",
    summary:
      "Mineral springs and abandoned Ossetian villages off the main road.",
    detail: "5h · moderate · 4×4 to the trailhead",
    verified: "Road reports · 6 h ago",
  },
  {
    id: "narikala",
    name: "Narikala Fortress",
    region: "tbilisi-core",
    group: "heritage",
    summary:
      "4th-century fortress above the sulphur baths, reached by cable car.",
    detail: "1h · cable car 2.5 ₾",
    verified: "Hours verified 1 d ago",
  },
  {
    id: "fabrika",
    name: "Fabrika",
    region: "tbilisi-core",
    group: "food",
    summary: "Soviet sewing factory turned courtyard of bars and cafés.",
    detail: "Evenings · ₾₾",
    verified: "Open today · 3 h ago",
  },
  {
    id: "art-museum",
    name: "Georgian National Museum",
    region: "tbilisi-core",
    group: "culture",
    summary: "The Colchian gold and the Dmanisi skulls, on Rustaveli Avenue.",
    detail: "2h · 15 ₾",
    verified: "Hours verified 2 d ago",
    note: { tone: "alert", text: "Closed Mondays" },
  },
  {
    id: "sighnaghi",
    name: "Sighnaghi old town",
    region: "kakheti",
    group: "heritage",
    summary: "Walled hill town over the Alazani valley.",
    detail: "Half a day",
    verified: "Hours verified 1 d ago",
  },
  {
    id: "pheasants-tears",
    name: "Pheasant's Tears",
    region: "kakheti",
    group: "food",
    summary: "Qvevri wines and a kitchen that cooks from the market.",
    detail: "Lunch · ₾₾ · book ahead",
    verified: "Open today · 4 h ago",
    note: { tone: "agent", text: "Rtveli — harvest season until mid-October" },
  },
  {
    id: "bodbe",
    name: "Bodbe Monastery",
    region: "kakheti",
    group: "heritage",
    summary: "Convent and resting place of St Nino, 2 km from Sighnaghi.",
    detail: "1h · dress code",
    verified: "Hours verified 3 d ago",
  },
  {
    id: "ushguli",
    name: "Ushguli towers",
    region: "svaneti",
    group: "heritage",
    summary:
      "Medieval defensive towers under Shkhara, among Europe's highest villages.",
    detail: "Full day from Mestia · 4×4",
    verified: "Road reports · 1 d ago",
    note: { tone: "alert", text: "Zagari Pass unpaved — watch after rain" },
  },
  {
    id: "chalaadi",
    name: "Chalaadi glacier",
    region: "svaneti",
    group: "nature",
    summary: "Forest walk to a glacier tongue, 8 km from Mestia.",
    detail: "4h · moderate",
    verified: "Trail clear · 2 d ago",
  },
  {
    id: "rooms-kazbegi",
    name: "Rooms Kazbegi",
    region: "kazbegi-corridor",
    group: "lodging",
    summary: "The terrace with the Kazbek view.",
    detail: "From 280 ₾ a night",
    verified: "Availability · 1 h ago",
  },
];

/**
 * Road conditions for the corridors a trip could use, as the watch layer sees
 * them this month. Explore shows these before you plan, because a road that is
 * closed in the season you travel changes which trip makes sense.
 */
export const roadSeason: RoadSeason[] = [
  {
    slug: "military-road",
    name: "Georgian Military Road",
    tone: "ok",
    status: "Open · mudflow season ended",
  },
  {
    slug: "kakheti-gombori",
    name: "Gombori Pass to Telavi",
    tone: "ok",
    status: "Open · fog some mornings",
  },
  {
    slug: "zugdidi-mestia",
    name: "Zugdidi – Mestia",
    tone: "ok",
    status: "Open · rockfall risk after rain",
  },
  {
    slug: "zagari-pass",
    name: "Zagari Pass (Ushguli – Lentekhi)",
    tone: "alert",
    status: "Unpaved · closes with first snow",
  },
];

export type SavedRoute = {
  id: string;
  title: string;
  days: number;
  stops: number;
  from: string;
  note: string;
};

export const savedPlaceIds = ["juta", "pheasants-tears", "ushguli", "narikala"];

export const savedRoutes: SavedRoute[] = [
  {
    id: "kazbegi-three",
    title: "Kazbegi in three days",
    days: 3,
    stops: 9,
    from: "Saved from your Georgia trip",
    note: "Gergeti, Juta and Truso, with the drive split at Ananuri",
  },
  {
    id: "kakheti-loop",
    title: "Kakheti wine loop",
    days: 2,
    stops: 7,
    from: "Saved from Kakheti wine weekend",
    note: "Sighnaghi, Bodbe and four qvevri cellars",
  },
];

/** Things the agent surfaced mid-trip that you kept for later. */
export const savedFinds = [
  {
    id: "sno-festival",
    title: "Sheep migration festival in Sno",
    when: "Every September · 18:00",
    from: "Found on day 3 of Georgia",
  },
];
