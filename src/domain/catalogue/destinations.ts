import type { LonLat } from "../geo.ts";
import type { AreaMatch } from "./focus-areas.ts";

// Where a trip can go: anywhere in Georgia the catalogue has places for. Every
// municipality and self-governing city is a destination under its own name,
// and so are the names travellers actually use — a historic region (Kakheti,
// Svaneti) or a resort that sits inside a municipality called something else
// (Gudauri is in Kazbegi, Ushguli in Mestia).
//
// The focus areas (focus-areas.ts) are where hand-curation is spent; this is
// the wider list a traveller chooses from. Both turn into the same SQL
// predicate (src/dal/area-predicate.ts).

export type Destination = {
  slug: string;
  name: string;
  /** Where it is, for judging the drive between two of them. */
  lonLat: LonLat;
  match: AreaMatch;
  /** Other things a traveller calls it, lower case. */
  aliases?: readonly string[];
  /** Months (1–12) in which it cannot be reached at all, and why. */
  closed?: { months: readonly number[]; why: string };
};

const region = (
  slug: string,
  name: string,
  lon: number,
  lat: number,
  aliases: readonly string[] = [],
): Destination => ({
  slug,
  name,
  lonLat: [lon, lat],
  match: { kind: "regions", slugs: [slug] },
  aliases,
});

/** A named spot inside a municipality: the same places, the traveller's name for them. */
const within = (
  slug: string,
  name: string,
  lon: number,
  lat: number,
  regionSlug: string,
  extra: Partial<Destination> = {},
): Destination => ({
  slug,
  name,
  lonLat: [lon, lat],
  match: { kind: "regions", slugs: [regionSlug] },
  ...extra,
});

const mkhare = (
  slug: string,
  name: string,
  lon: number,
  lat: number,
  code: string,
  aliases: readonly string[] = [],
): Destination => ({
  slug,
  name,
  lonLat: [lon, lat],
  match: { kind: "isoRegion", code },
  aliases,
});

export const destinations: readonly Destination[] = [
  // The capital is planned inside its walkable centre (the tbilisi-core focus
  // area): the municipality reaches out to suburbs no visitor is sent to.
  {
    slug: "tbilisi",
    name: "Tbilisi",
    lonLat: [44.8, 41.695],
    match: {
      kind: "bbox",
      west: 44.74,
      south: 41.68,
      east: 44.83,
      north: 41.735,
    },
    aliases: ["tiflis", "capital", "old town", "sololaki"],
  },

  // Historic regions and the names that span several municipalities.
  mkhare("kakheti", "Kakheti", 45.6, 41.85, "GE-KA", [
    "wine country",
    "wine region",
  ]),
  {
    slug: "svaneti",
    name: "Svaneti",
    lonLat: [42.73, 43.045],
    match: { kind: "regions", slugs: ["mestia", "lentekhi"] },
    aliases: ["upper svaneti"],
  },
  mkhare("adjara", "Adjara", 41.85, 41.62, "GE-AJ", ["ajara", "adjaria"]),
  mkhare("imereti", "Imereti", 42.9, 42.2, "GE-IM"),
  mkhare("guria", "Guria", 42.1, 41.97, "GE-GU"),
  mkhare("samegrelo", "Samegrelo", 42.1, 42.5, "GE-SZ", ["mingrelia"]),
  {
    slug: "racha",
    name: "Racha",
    lonLat: [43.3, 42.6],
    match: { kind: "regions", slugs: ["ambrolauri", "oni"] },
  },
  mkhare("samtskhe-javakheti", "Samtskhe-Javakheti", 43.2, 41.6, "GE-SJ", [
    "javakheti",
    "meskheti",
    "samtskhe",
  ]),
  mkhare("kvemo-kartli", "Kvemo Kartli", 44.5, 41.45, "GE-KK"),
  mkhare("shida-kartli", "Shida Kartli", 44.0, 42.0, "GE-SK"),

  // Places known by a name of their own inside a municipality.
  within("gudauri", "Gudauri", 44.477, 42.478, "kazbegi"),
  within("ushguli", "Ushguli", 43.016, 42.917, "mestia"),
  within("bakuriani", "Bakuriani", 43.53, 41.75, "borjomi"),
  within("vardzia", "Vardzia", 43.284, 41.381, "aspindza"),
  within("david-gareja", "David Gareja", 45.376, 41.447, "sagarejo", {
    aliases: ["davit gareja", "david gareji", "udabno"],
  }),
  within("tusheti", "Tusheti", 45.633, 42.37, "akhmeta", {
    aliases: ["omalo"],
    closed: {
      months: [11, 12, 1, 2, 3, 4, 5],
      why: "the only road in, over the Abano Pass, is closed by snow from November to May",
    },
  }),
  within("khevsureti", "Khevsureti", 45.17, 42.66, "dusheti", {
    aliases: ["shatili"],
    closed: {
      months: [11, 12, 1, 2, 3, 4, 5],
      why: "the road over the Datvisjvari Pass is closed by snow from November to May",
    },
  }),

  // Municipalities and self-governing cities, west to east by region.
  region("batumi", "Batumi", 41.625, 41.624, ["black sea", "seaside"]),
  region("keda", "Keda", 41.946, 41.6),
  region("khelvachauri", "Khelvachauri", 41.675, 41.557, ["gonio", "sarpi"]),
  region("khulo", "Khulo", 42.41, 41.647, ["goderdzi"]),
  region("kobuleti", "Kobuleti", 41.948, 41.762),
  region("shuakhevi", "Shuakhevi", 42.197, 41.624),
  region("chokhatauri", "Chokhatauri", 42.426, 41.938, ["bakhmaro"]),
  region("lanchkhuti", "Lanchkhuti", 41.945, 42.074),
  region("ozurgeti", "Ozurgeti", 41.998, 41.913, ["ureki", "shekvetili"]),
  region("baghdati", "Baghdati", 42.903, 42.0),
  region("chiatura", "Chiatura", 43.258, 42.282, ["katskhi"]),
  region("kharagauli", "Kharagauli", 43.236, 41.995),
  region("khoni", "Khoni", 42.486, 42.398),
  region("kutaisi", "Kutaisi", 42.663, 42.26, ["gelati", "bagrati"]),
  region("sachkhere", "Sachkhere", 43.499, 42.274),
  region("samtredia", "Samtredia", 42.365, 42.138),
  region("terjola", "Terjola", 42.923, 42.227),
  region("tqibuli", "Tqibuli", 42.903, 42.376, ["tkibuli"]),
  region("tskaltubo", "Tskaltubo", 42.606, 42.309, [
    "prometheus cave",
    "sataplia",
  ]),
  region("vani", "Vani", 42.639, 41.979),
  region("zestaponi", "Zestaponi", 43.053, 42.133),
  region("akhmeta", "Akhmeta", 45.248, 42.226, ["pankisi"]),
  region("dedoplistsqaro", "Dedoplistsqaro", 46.12, 41.317, [
    "dedoplistskaro",
    "vashlovani",
  ]),
  region("gurjaani", "Gurjaani", 45.761, 41.726),
  region("kvareli", "Kvareli", 45.844, 41.988),
  region("lagodekhi", "Lagodekhi", 46.156, 41.821),
  region("sagarejo", "Sagarejo", 45.419, 41.667),
  region("signagi", "Sighnaghi", 45.724, 41.484, [
    "signagi",
    "sighnagi",
    "bodbe",
  ]),
  region("telavi", "Telavi", 45.509, 42.05, ["tsinandali", "alaverdi"]),
  region("bolnisi", "Bolnisi", 44.523, 41.344),
  region("dmanisi", "Dmanisi", 44.164, 41.358),
  region("gardabani", "Gardabani", 44.964, 41.601),
  region("marneuli", "Marneuli", 44.896, 41.378),
  region("rustavi", "Rustavi", 45.015, 41.547),
  region("tetritskaro", "Tetritskaro", 44.5, 41.613),
  region("tsalka", "Tsalka", 43.981, 41.628),
  region("dusheti", "Dusheti", 44.79, 42.338, ["ananuri", "pasanauri"]),
  region("kazbegi", "Kazbegi", 44.561, 42.602, [
    "stepantsminda",
    "gergeti",
    "military road",
    "military highway",
    "juta",
  ]),
  region("mtskheta", "Mtskheta", 44.717, 41.845, ["jvari", "svetitskhoveli"]),
  region("tianeti", "Tianeti", 44.966, 42.139),
  region("ambrolauri", "Ambrolauri", 43.093, 42.598, ["shaori"]),
  region("lentekhi", "Lentekhi", 42.834, 42.815, ["lower svaneti"]),
  region("oni", "Oni", 43.535, 42.668, ["shovi"]),
  region("tsageri", "Tsageri", 42.747, 42.619, ["lechkhumi"]),
  region("adigeni", "Adigeni", 42.703, 41.707, ["abastumani"]),
  region("akhalkalaki", "Akhalkalaki", 43.498, 41.432),
  region("akhaltsikhe", "Akhaltsikhe", 42.99, 41.631, ["rabati"]),
  region("aspindza", "Aspindza", 43.235, 41.504),
  region("borjomi", "Borjomi", 43.539, 41.773),
  region("ninotsminda", "Ninotsminda", 43.745, 41.324, ["paravani"]),
  region("gori", "Gori", 44.145, 41.988, ["uplistsikhe"]),
  region("kareli", "Kareli", 43.878, 41.982),
  region("kaspi", "Kaspi", 44.388, 41.895),
  region("khashuri", "Khashuri", 43.626, 42.019, ["surami"]),
  region("abasha", "Abasha", 42.19, 42.207),
  region("chkhorotsqu", "Chkhorotsqu", 42.228, 42.621, ["chkhorotsku"]),
  region("khobi", "Khobi", 41.812, 42.284),
  region("martvili", "Martvili", 42.384, 42.54),
  region("mestia", "Mestia", 42.498, 43.033),
  region("poti", "Poti", 41.676, 42.139, ["kolkheti"]),
  region("senaki", "Senaki", 42.117, 42.3),
  region("tsalenjikha", "Tsalenjikha", 42.074, 42.689),
  region("zugdidi", "Zugdidi", 41.831, 42.474, ["dadiani"]),
];

export const destinationSlugs = destinations.map((d) => d.slug) as [
  string,
  ...string[],
];

const bySlug = new Map(destinations.map((d) => [d.slug, d]));

export const destination = (slug: string): Destination | undefined =>
  bySlug.get(slug);

export const destinationName = (slug: string): string =>
  bySlug.get(slug)?.name ?? slug;

/**
 * Names a traveller might type that no trip can include, and the reason. Said
 * back to them rather than quietly ignored: a plan that drops the one place
 * they asked for is not the plan they asked for.
 */
export const outOfReach: readonly { names: readonly string[]; why: string }[] =
  [
    {
      names: ["abkhazia", "sukhumi", "sokhumi", "gagra", "pitsunda"],
      why: "Abkhazia cannot be entered from the rest of Georgia",
    },
    {
      names: ["south ossetia", "tskhinvali", "akhalgori"],
      why: "South Ossetia cannot be entered from the rest of Georgia",
    },
    {
      names: [
        "armenia",
        "yerevan",
        "azerbaijan",
        "baku",
        "turkey",
        "istanbul",
        "trabzon",
        "russia",
        "vladikavkaz",
      ],
      why: "trip.io plans trips inside Georgia only",
    },
  ];

const words = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** [name, slug], longest first, so "david gareja" is found before "david". */
const NAMES: [string, string][] = destinations
  .flatMap((d) =>
    [d.name, d.slug.replace(/-/g, " "), ...(d.aliases ?? [])].map(
      (n) => [words(n), d.slug] as [string, string],
    ),
  )
  .sort((a, b) => b[0].length - a[0].length);

export type Mention = {
  slug: string;
  index: number;
  /** The few words before the name ("starting in", "back to"), lower case. */
  before: string;
};

/**
 * Every destination a sentence names, in the order it names them. A longer
 * name hides a shorter one inside it ("Lower Svaneti" is Lentekhi, not also
 * Svaneti); a destination named twice is reported at each place it appears, so
 * "Tbilisi to Kazbegi and back to Tbilisi" keeps its return.
 */
export function mentions(text: string): Mention[] {
  const haystack = ` ${words(text)} `;
  const taken: [number, number][] = [];
  const found: Mention[] = [];
  for (const [name, slug] of NAMES) {
    const needle = ` ${name} `;
    let at = haystack.indexOf(needle);
    while (at >= 0) {
      const span: [number, number] = [at + 1, at + needle.length - 1];
      if (!taken.some(([a, b]) => span[0] < b && a < span[1])) {
        taken.push(span);
        found.push({
          slug,
          index: span[0],
          before: haystack
            .slice(0, span[0])
            .trim()
            .split(" ")
            .slice(-3)
            .join(" "),
        });
      }
      at = haystack.indexOf(needle, at + 1);
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Places a sentence names that a trip cannot go to, with why. */
export function unreachable(text: string): { name: string; why: string }[] {
  const haystack = ` ${words(text)} `;
  return outOfReach.flatMap(({ names, why }) => {
    const name = names.find((n) => haystack.includes(` ${n} `));
    return name
      ? [{ name: name.replace(/\b[a-z]/g, (l) => l.toUpperCase()), why }]
      : [];
  });
}
