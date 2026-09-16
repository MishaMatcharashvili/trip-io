// Georgian national romanisation system (2002), the one on road signs and in
// passports. Deterministic letter-for-letter, so it's safe to apply to Overture
// names that arrive only in Mkhedruli; the curator corrects the few that have an
// established English form (e.g. "Tbilisi Sea" rather than "Tbilisis zghva").

export const romanisation: Readonly<Record<string, string>> = {
  ა: "a",
  ბ: "b",
  გ: "g",
  დ: "d",
  ე: "e",
  ვ: "v",
  ზ: "z",
  თ: "t",
  ი: "i",
  კ: "k'",
  ლ: "l",
  მ: "m",
  ნ: "n",
  ო: "o",
  პ: "p'",
  ჟ: "zh",
  რ: "r",
  ს: "s",
  ტ: "t'",
  უ: "u",
  ფ: "p",
  ქ: "k",
  ღ: "gh",
  ყ: "q'",
  შ: "sh",
  ჩ: "ch",
  ც: "ts",
  ძ: "dz",
  წ: "ts'",
  ჭ: "ch'",
  ხ: "kh",
  ჯ: "j",
  ჰ: "h",
};

/** Matches any Mkhedruli letter. */
export const georgianScript = /[ა-ჿ]/;

/**
 * Road-sign style: the 2002 system marks ejectives with an apostrophe, but signs
 * and most English-language guides drop it ("Kutaisi", not "K'ut'aisi"). Travellers
 * search for the sign spelling.
 */
export function romanise(text: string): string {
  let out = "";
  for (const char of text) {
    const latin = romanisation[char];
    out += latin === undefined ? char : latin.replace("'", "");
  }
  // Word-initial capital, as on signs; Mkhedruli has no case.
  return out.replace(
    /(^|[\s\-–(«"])(\p{Ll})/gu,
    (_, sep, letter) => sep + letter.toUpperCase(),
  );
}

// Overture often packs both forms into one name: "Villa Digomi • ვილა დიღომი".
const BILINGUAL_SEPARATOR = /\s+[•·|/]\s+/;

/**
 * Splits an Overture primary name into a display name and its Georgian form.
 * Prefers a Latin part the source already provides over a transliteration.
 */
export function splitName(primary: string): {
  name: string;
  nameKa: string | null;
} {
  if (!georgianScript.test(primary)) return { name: primary, nameKa: null };

  const parts = primary.split(BILINGUAL_SEPARATOR);
  const ka = parts.filter((p) => georgianScript.test(p));
  const latin = parts.filter((p) => !georgianScript.test(p));

  if (latin.length > 0 && ka.length > 0) {
    return { name: latin[0], nameKa: ka[0] };
  }
  return { name: romanise(primary), nameKa: primary };
}
