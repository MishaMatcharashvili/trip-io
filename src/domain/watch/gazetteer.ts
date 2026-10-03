// A place name from an article, to one of the sense regions. Georgian names
// reach us transliterated by a translator, which spells them however it likes
// (Sighnaghi, Signagi, Sighnaghi Municipality), so this is a table of the
// spellings seen and the towns and resorts that sit inside a municipality
// under a different name — Gudauri is in Kazbegi, Stepantsminda is Kazbegi's
// seat.
//
// A place that matches nothing is `null`, and the caller drops the claim. A
// guess here would put a Tbilisi road closure on a trip in Kutaisi.

/** Region slug → other names for it. The region's own name needs no entry. */
const ALIASES: Record<string, readonly string[]> = {
  kazbegi: [
    "stepantsminda",
    "kazbek",
    "gudauri",
    "kobi",
    "jvari pass",
    "cross pass",
    "juta",
    "gergeti",
    "sno",
    "dariali",
    "darial",
    "darial gorge",
    "larsi",
  ],
  tbilisi: ["tiflis", "rustaveli avenue", "rustaveli", "old tbilisi"],
  signagi: ["sighnaghi", "sighnagi", "signaghi", "bodbe"],
  telavi: ["kakheti wine", "alaverdi", "gremi", "tsinandali"],
  mestia: ["svaneti", "upper svaneti", "ushguli", "hatsvali", "tetnuldi"],
  lentekhi: ["lower svaneti", "kvemo svaneti"],
  mtskheta: ["jvari monastery", "svetitskhoveli"],
  akhmeta: ["tusheti", "omalo", "shenako"],
  dusheti: ["pshav-khevsureti", "khevsureti", "shatili", "pshavi"],
  kvareli: ["lopota", "kvareli lake"],
  gurjaani: ["vazisubani"],
  oni: ["racha"],
  ambrolauri: ["racha", "shovi"],
  borjomi: ["bakuriani", "borjomi-kharagauli"],
  akhaltsikhe: ["vardzia", "rabati", "meskheti"],
  aspindza: ["vardzia"],
  adigeni: ["abastumani"],
  kutaisi: ["gelati", "motsameta", "bagrati"],
  tskaltubo: ["prometheus cave", "sataplia"],
  batumi: ["adjara", "ajara", "gonio"],
  khelvachauri: ["sarpi"],
  kobuleti: ["ureki", "ureki beach"],
  khulo: ["goderdzi", "goderdzi pass"],
  zugdidi: ["enguri", "dadiani palace"],
  martvili: ["martvili canyon"],
  kharagauli: ["borjomi-kharagauli national park"],
  gori: ["uplistsikhe", "stalin museum"],
  marneuli: ["kvemo kartli"],
  dmanisi: ["dmanisi hominid"],
  dedoplistsqaro: ["vashlovani", "udabno", "david gareja", "davit gareja"],
  lagodekhi: ["lagodekhi nature reserve"],
  tsalka: ["tsalka canyon"],
  akhalkalaki: ["javakheti", "paravani"],
  ninotsminda: ["javakheti"],
  khashuri: ["surami"],
  rustavi: [],
};

/** Plural and municipality suffixes a translator tacks on. */
const SUFFIXES = / (municipality|district|region|city|town|village)$/;

const normalize = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(SUFFIXES, "")
    .trim();

/**
 * Aliases that name more than one region (Racha, Javakheti, Vardzia). The
 * first region wins as a *default*, but a place that is ambiguous is not a
 * place we can pin to a stop: refuse it rather than choose.
 */
const ambiguous = (alias: string): boolean =>
  Object.values(ALIASES).filter((list) => list.includes(alias)).length > 1;

/** [name, slug] pairs, longest name first so "darial gorge" beats "darial". */
function table(slugs: ReadonlySet<string>): [string, string][] {
  const out: [string, string][] = [];
  for (const slug of slugs)
    out.push([normalize(slug.replace(/-/g, " ")), slug]);
  for (const [slug, names] of Object.entries(ALIASES)) {
    if (!slugs.has(slug)) continue;
    for (const name of names) {
      if (!ambiguous(name)) out.push([normalize(name), slug]);
    }
  }
  return out.sort((a, b) => b[0].length - a[0].length);
}

/**
 * The region a place name belongs to, or null. A whole-string match wins, then
 * the longest known name found as whole words inside it ("Rustaveli Avenue,
 * Tbilisi" is Tbilisi). When a string names two regions ("Tbilisi to Kazbegi")
 * it is a journey, not a place, and is refused.
 */
export function resolveRegion(
  place: string,
  slugs: ReadonlySet<string>,
): string | null {
  const text = normalize(place);
  if (!text) return null;

  const names = table(slugs);
  const exact = names.find(([name]) => name === text);
  if (exact) return exact[1];

  const found = new Set<string>();
  for (const [name, slug] of names) {
    if (new RegExp(`(^|[^a-z0-9])${name}([^a-z0-9]|$)`).test(text)) {
      found.add(slug);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}
