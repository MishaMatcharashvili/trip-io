import type { FocusAreaSlug } from "../../catalogue/focus-areas.ts";
import type { Pace } from "../document.ts";
import type { Constraints, Interest } from "./constraints.ts";
import { addDays } from "./schedule.ts";

// "7 days in Georgia, €700, nature and monasteries, with my father" → the
// constraints generation runs on. Deterministic on purpose: no model call to
// read a sentence the traveller then corrects on screen anyway, and every rule
// here is a test. What the words did not say is filled with a default and
// reported as assumed, so the screen can say "assumed" rather than pretend.

export type Understood = {
  constraints: Constraints;
  /** Fields the words actually said, as opposed to defaults. */
  said: (keyof Constraints)[];
};

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
/** A month, from its name or an abbreviation of it ("oct", "sept") — not any word that shares three letters with one. */
const monthOf = (word: string) => {
  const w = word.toLowerCase();
  return w.length < 3 ? -1 : MONTHS.findIndex((m) => m.startsWith(w));
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fourteen: 14,
};
const num = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? Number(s);
const NUMBER =
  "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen)";

const AREA_WORDS: [FocusAreaSlug, RegExp][] = [
  ["tbilisi-core", /\b(tbilisi|capital|old town|sololaki)\b/i],
  [
    "kazbegi-corridor",
    /\b(kazbegi|stepantsminda|gergeti|gudauri|military (road|highway)|mountains?|caucasus|mtskheta)\b/i,
  ],
  ["kakheti", /\b(kakheti|wine|wineries|telavi|sighnaghi|signagi|qvevri)\b/i],
  ["svaneti", /\b(svaneti|mestia|ushguli)\b/i],
];

const INTEREST_WORDS: [Interest, RegExp][] = [
  [
    "nature",
    /\b(nature|hik(e|es|ing)|mountains?|lakes?|walk(s|ing)?|trek(king)?|outdoors?)\b/i,
  ],
  [
    "heritage",
    /\b(monaster(y|ies)|church(es)?|castles?|fortress(es)?|histor(y|ic)|heritage|old town)\b/i,
  ],
  ["culture", /\b(museums?|art|culture|theat(re|er)|music|galler(y|ies))\b/i],
  ["food", /\b(food|wine|eat(ing)?|restaurants?|cuisine|cooking|supra)\b/i],
];

/** Days, from "7 days", "5 nights", "a week", "long weekend", "two weeks". */
function readDays(text: string): number | null {
  const days = text.match(new RegExp(`\\b${NUMBER}[- ](days?|d)\\b`, "i"));
  if (days) return num(days[1]);
  const nights = text.match(new RegExp(`\\b${NUMBER}[- ]nights?\\b`, "i"));
  if (nights) return num(nights[1]) + 1;
  const weeks = text.match(new RegExp(`\\b${NUMBER}[- ]weeks?\\b`, "i"));
  if (weeks) return num(weeks[1]) * 7;
  if (/\bfortnight\b/i.test(text)) return 14;
  if (/\bweek\b/i.test(text)) return 7;
  if (/\blong weekend\b/i.test(text)) return 3;
  if (/\bweekend\b/i.test(text)) return 2;
  return null;
}

/** A start date: "2026-10-12", "12 October", "Oct 12", "in October", "next week". */
function readStart(text: string, today: string): string | null {
  const iso = text.match(/\b(20\d\d-\d\d-\d\d)\b/);
  if (iso) return iso[1];

  const [year] = today.split("-").map(Number);
  const on = (month: number, day: number) => {
    let date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (date < today) date = `${year + 1}${date.slice(4)}`;
    return date;
  };
  const dayMonth = text.match(
    /\b(\d{1,2})(st|nd|rd|th)?\s+(of\s+)?([a-z]{3,9})\b/i,
  );
  if (dayMonth && monthOf(dayMonth[4]) >= 0) {
    return on(monthOf(dayMonth[4]), Number(dayMonth[1]));
  }
  const monthDay = text.match(/\b([a-z]{3,9})\s+(\d{1,2})(st|nd|rd|th)?\b/i);
  if (monthDay && monthOf(monthDay[1]) >= 0) {
    return on(monthOf(monthDay[1]), Number(monthDay[2]));
  }
  const inMonth = text.match(/\b(in|during|this|next)\s+([a-z]{3,9})\b/i);
  if (inMonth && monthOf(inMonth[2]) >= 0) {
    const first = on(monthOf(inMonth[2]), 1);
    return first < today ? today : first;
  }
  if (/\btomorrow\b/i.test(text)) return addDays(today, 1);
  if (/\bnext week\b/i.test(text)) return addDays(today, 7);
  if (/\bnext month\b/i.test(text)) return addDays(today, 30);
  return null;
}

/** Budget in euros. Dollars are close enough to say; lari are converted. */
function readBudget(text: string): number | null {
  const symbol = text.match(/([€$£])\s?(\d[\d,.]*)\s*(k)?\b/i);
  const word = text.match(
    /\b(\d[\d,.]*)\s*(k)?\s*(eur|euros?|usd|dollars?|gel|lari)\b/i,
  );
  const raw = symbol
    ? { n: symbol[2], k: symbol[3], unit: symbol[1] }
    : word
      ? { n: word[1], k: word[2], unit: word[3] }
      : null;
  if (!raw) return null;
  let amount = Number(raw.n.replace(/,/g, "")) * (raw.k ? 1000 : 1);
  if (/gel|lari/i.test(raw.unit)) amount = Math.round(amount * 0.34);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function readParty(text: string): Constraints["party"] | null {
  const kids = text.match(
    new RegExp(`\\b${NUMBER}\\s+(kids|children)\\b`, "i"),
  );
  const children = kids
    ? num(kids[1])
    : /\b(kids|children|son|daughter|family)\b/i.test(text)
      ? 1
      : 0;
  const people = text.match(
    new RegExp(`\\b${NUMBER}\\s+(people|adults|of us|friends|persons)\\b`, "i"),
  );
  if (people) {
    const n = num(people[1]);
    return { adults: /friends/i.test(people[2]) ? n + 1 : n, children };
  }
  if (/\b(my )?parents\b/i.test(text)) return { adults: 3, children };
  if (
    /\bwith (my )?(father|dad|mother|mum|mom|partner|wife|husband|girlfriend|boyfriend|friend|brother|sister)\b/i.test(
      text,
    ) ||
    /\b(couple|honeymoon|the two of us)\b/i.test(text)
  ) {
    return { adults: 2, children };
  }
  if (children) return { adults: 2, children };
  if (/\b(solo|alone|by myself|on my own)\b/i.test(text)) {
    return { adults: 1, children: 0 };
  }
  return null;
}

function readPace(text: string): Pace | null {
  if (/\b(packed|busy|intense|as much as possible|lots to see)\b/i.test(text)) {
    return "packed";
  }
  if (/\b(relaxed|slow|easy|laid[- ]back|no rush|chill)\b/i.test(text)) {
    return "relaxed";
  }
  if (/\bmoderate\b/i.test(text)) return "moderate";
  return null;
}

function readMobility(text: string): Constraints["mobility"] | null {
  if (
    /\b(wheelchair|limited mobility|elderly|father|dad|mother|mum|mom|parents|grand(ma|pa|parents)|toddler)\b/i.test(
      text,
    )
  ) {
    return "low";
  }
  if (/\b(hard hikes?|trek(king)?|strenuous|fit|climb(ing)?)\b/i.test(text)) {
    return "high";
  }
  return null;
}

/** Read a sentence into constraints, with defaults for what it did not say. */
export function understand(text: string, today: string): Understood {
  const said: (keyof Constraints)[] = [];
  const pick = <K extends keyof Constraints>(
    key: K,
    value: Constraints[K] | null,
    fallback: Constraints[K],
  ): Constraints[K] => {
    if (value === null) return fallback;
    said.push(key);
    return value;
  };

  const days = pick("days", readDays(text), 5);
  const clampedDays = Math.min(21, Math.max(1, days));
  const areasSaid = AREA_WORDS.filter(([, re]) => re.test(text)).map(
    ([slug]) => slug,
  );
  const areas = pick(
    "areas",
    areasSaid.length ? areasSaid.slice(0, 4) : null,
    clampedDays >= 4 ? ["tbilisi-core", "kazbegi-corridor"] : ["tbilisi-core"],
  );
  const interestsSaid = INTEREST_WORDS.filter(([, re]) => re.test(text)).map(
    ([interest]) => interest,
  );
  const party = pick("party", readParty(text), { adults: 1, children: 0 });
  const mobility = pick("mobility", readMobility(text), "moderate");
  const pace = pick(
    "pace",
    readPace(text),
    mobility === "low" ? "relaxed" : "moderate",
  );
  const people = party.adults + party.children;

  const constraints: Constraints = {
    startDate: pick("startDate", readStart(text, today), addDays(today, 14)),
    days: clampedDays,
    areas,
    pace,
    interests: pick(
      "interests",
      interestsSaid.length ? interestsSaid : null,
      [],
    ),
    party,
    mobility,
    budgetEur: Math.min(
      100_000,
      pick("budgetEur", readBudget(text), 90 * clampedDays * people),
    ),
  };
  return { constraints, said };
}
