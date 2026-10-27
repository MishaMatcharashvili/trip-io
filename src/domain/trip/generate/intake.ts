import { z } from "zod";
import {
  destinationName,
  destinationSlugs,
  MAX_PLACES,
} from "../../catalogue/destinations.ts";
import { paces } from "../document.ts";
import {
  type Constraints,
  constraints,
  DEFAULT_ENDPOINT,
  interests,
  NOTES_MAX_CHARS,
  routeOf,
} from "./constraints.ts";
import { understand } from "./request.ts";

// The conversation on /new. The traveller says what they want, a planner
// replies and keeps the constraints generation will run on, and nothing is
// built until the traveller asks for it. The planner is a model call behind
// the `Intaker` port; what it returns is a patch that `readIntake` checks and
// merges, so a bad answer can be a poor sentence, never an invalid request.
// `fallbackTurn` is the same turn without a model, from `understand`.
//
// The state travels with the request: the browser holds it and sends it back
// each turn, so a correction made by hand on a card is simply the state the
// next turn starts from.

/** Messages the traveller may send in one conversation. */
export const INTAKE_MAX_TURNS = 12;
export const INTAKE_MAX_CHARS = 500;
const REPLY_MAX_CHARS = 900;

/**
 * Replies the planner may spend asking before it stops: the places and the
 * length first, then the few details that change a plan most. A conversation
 * that has not reached "ready" by then is declared ready, so the traveller is
 * never interrogated; whatever is unsaid keeps its default.
 */
export const INTAKE_MAX_QUESTIONS = 4;
/** Suggested answers offered under a question, and how long each may be. */
const SUGGESTIONS_MAX = 4;
const SUGGESTION_MAX_CHARS = 40;

export const intakeMessage = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("traveller"),
    text: z.string().trim().min(1).max(INTAKE_MAX_CHARS),
  }),
  z.object({
    role: z.literal("planner"),
    text: z.string().min(1).max(REPLY_MAX_CHARS),
  }),
]);
export type IntakeMessage = z.infer<typeof intakeMessage>;

const stated = [
  "startDate",
  "days",
  "places",
  "start",
  "finish",
  "pace",
  "interests",
  "party",
  "mobility",
  "budgetEur",
] as const satisfies readonly (keyof Constraints)[];
type Stated = (typeof stated)[number];

export const intakeState = z.object({
  constraints,
  /** Fields the traveller stated or set by hand, as opposed to defaults. */
  said: z.array(z.enum(stated)),
});
export type IntakeState = z.infer<typeof intakeState>;

/** What the planner answers with. Null leaves a field as it was. */
export const intakeReply = z.object({
  reply: z.string().min(1).max(REPLY_MAX_CHARS),
  startDate: z.string().nullable(),
  days: z.number().nullable(),
  /** The whole route after this turn, in the order it is travelled. */
  places: z.array(z.enum(destinationSlugs)).nullable(),
  /** Where the traveller arrives and leaves from; null leaves it as it was. */
  start: z.enum(destinationSlugs).nullable(),
  finish: z.enum(destinationSlugs).nullable(),
  pace: z.enum(paces).nullable(),
  interests: z.array(z.enum(interests)).nullable(),
  adults: z.number().nullable(),
  children: z.number().nullable(),
  mobility: z.enum(["low", "moderate", "high"]).nullable(),
  budgetEur: z.number().nullable(),
  /** The whole of the notes after this turn, not an addition to them. */
  notes: z.string().nullable(),
  /** Places the traveller asked for that no trip can go to. */
  unsupported: z.array(z.string()),
  /** Nothing left that the planner needs to ask. */
  ready: z.boolean(),
  /** Two to four short answers to the question the reply ends on; none when it asks nothing. */
  suggestions: z.array(z.string()),
});

export type IntakeInput = {
  /** YYYY-MM-DD in Tbilisi. */
  today: string;
  state: IntakeState;
  messages: IntakeMessage[];
};

/** The port the model call implements (src/infra/openai-intake.ts). */
export type Intaker = (input: IntakeInput) => Promise<unknown>;

export type IntakeTurn = {
  reply: string;
  state: IntakeState;
  unsupported: string[];
  ready: boolean;
  /** Answers to offer as one-tap replies. Empty once the planner has nothing to ask. */
  suggestions: string[];
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(n)));

const realDate = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
  !Number.isNaN(Date.parse(`${iso}T12:00:00Z`));

/** Where a conversation starts: every field a default, none of them said. */
export function initialState(today: string): IntakeState {
  return { constraints: understand("", today).constraints, said: [] };
}

/**
 * The defaults that follow from other fields, for whatever is still unsaid: a
 * budget for this many people and days, a pace for this mobility, and the
 * second place a longer trip has room for.
 */
function withDefaults(c: Constraints, said: readonly Stated[]): Constraints {
  const has = (k: Stated) => said.includes(k);
  const people = c.party.adults + c.party.children;
  return {
    ...c,
    places: has("places")
      ? c.places
      : c.days >= 4
        ? ["tbilisi", "kazbegi"]
        : ["tbilisi"],
    start: has("start") ? c.start : DEFAULT_ENDPOINT,
    // Said where it starts and not where it finishes: it finishes where it started.
    finish: has("finish")
      ? c.finish
      : has("start")
        ? c.start
        : DEFAULT_ENDPOINT,
    pace: has("pace") ? c.pace : c.mobility === "low" ? "relaxed" : "moderate",
    budgetEur: has("budgetEur")
      ? c.budgetEur
      : Math.min(100_000, 90 * c.days * people),
  };
}

/** A hand correction: the patch, marked said, with the defaults that follow. */
export function applyEdit(
  state: IntakeState,
  patch: Partial<Constraints>,
): IntakeState {
  const said = [
    ...new Set([...state.said, ...stated.filter((k) => k in patch)]),
  ];
  return {
    constraints: withDefaults({ ...state.constraints, ...patch }, said),
    said,
  };
}

/**
 * The planner's answer, merged onto the state it was given. A value out of
 * range is clamped, a start date that is not a date or is already past is
 * ignored, and an answer that is not the shape asked for is null.
 */
export function readIntake(
  raw: unknown,
  state: IntakeState,
  today: string,
  /** Replies the planner has already given in this conversation. */
  asked = 0,
): IntakeTurn | null {
  const parsed = intakeReply.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;
  const c = state.constraints;

  const patch: Partial<Constraints> = {};
  if (r.startDate !== null && realDate(r.startDate) && r.startDate >= today) {
    patch.startDate = r.startDate;
  }
  if (r.days !== null) patch.days = clamp(r.days, 1, 21);
  // In order, and a round trip names its start twice: only a name said twice
  // running is dropped.
  if (r.places?.length) {
    patch.places = r.places
      .filter((slug, i, all) => slug !== all[i - 1])
      .slice(0, MAX_PLACES);
  }
  if (r.start !== null) patch.start = r.start;
  if (r.finish !== null) patch.finish = r.finish;
  if (r.pace !== null) patch.pace = r.pace;
  if (r.interests !== null) patch.interests = [...new Set(r.interests)];
  if (r.adults !== null || r.children !== null) {
    patch.party = {
      adults: clamp(r.adults ?? c.party.adults, 1, 12),
      children: clamp(r.children ?? c.party.children, 0, 12),
    };
  }
  if (r.mobility !== null) patch.mobility = r.mobility;
  if (r.budgetEur !== null) patch.budgetEur = clamp(r.budgetEur, 0, 100_000);

  const next = applyEdit(state, patch);
  if (r.notes !== null) {
    next.constraints.notes = r.notes.trim().slice(0, NOTES_MAX_CHARS);
  }
  if (!constraints.safeParse(next.constraints).success) return null;

  // The budget for questions is the code's, not the model's: past it the
  // conversation is ready whatever the model thinks is left to ask, provided
  // the two things a trip cannot be built without were said.
  const essentials = next.said.includes("places") && next.said.includes("days");
  const ready = r.ready || (essentials && asked + 1 >= INTAKE_MAX_QUESTIONS);

  return {
    reply: r.reply,
    state: next,
    unsupported: r.unsupported.slice(0, 5),
    ready,
    suggestions: ready ? [] : cleanSuggestions(r.suggestions),
  };
}

/** Short, distinct and few: a row of buttons, not a menu. */
export function cleanSuggestions(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of raw) {
    const clean = text.trim().replace(/\s+/g, " ");
    const key = clean.toLowerCase();
    if (!clean || clean.length > SUGGESTION_MAX_CHARS || seen.has(key))
      continue;
    seen.add(key);
    out.push(clean);
  }
  return out.slice(0, SUGGESTIONS_MAX);
}

/**
 * What to ask next, when no model is there to choose: the first detail the
 * traveller has not given, in the order that changes a plan most, with answers
 * `understand` can read back. Null once none is left.
 */
export function nextQuestion(
  said: readonly string[],
): { question: string; suggestions: string[] } | null {
  if (!said.includes("party")) {
    return {
      question: "Who is travelling?",
      suggestions: ["Solo", "Couple", "Family with kids", "4 friends"],
    };
  }
  if (!said.includes("interests")) {
    return {
      question: "What do you like most: food and wine, hiking, or history?",
      suggestions: [
        "Food and wine",
        "Hiking and nature",
        "Monasteries and history",
      ],
    };
  }
  if (!said.includes("pace")) {
    return {
      question: "Slow days, or as much as fits?",
      suggestions: ["Relaxed", "Packed, as much as possible"],
    };
  }
  return null;
}

const list = (words: string[]) =>
  words.length < 2
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

/**
 * A turn without the model: the latest message read by `understand`, merged
 * onto the state, and a reply that says what is held and what was assumed. It
 * says the places `understand` refused, and why. The message itself is kept as notes, since nothing here can pick the wishes out of it.
 */
export function fallbackTurn(
  messages: readonly IntakeMessage[],
  state: IntakeState,
  today: string,
): IntakeTurn {
  const latest =
    messages.findLast((m) => m.role === "traveller")?.text.trim() ?? "";
  const read = understand(latest, today);
  const patch: Partial<Constraints> = {};
  for (const key of stated) {
    if (read.said.includes(key))
      Object.assign(patch, { [key]: read.constraints[key] });
  }
  const next = applyEdit(state, patch);
  next.constraints.notes = [state.constraints.notes, latest]
    .filter(Boolean)
    .join(" · ")
    .slice(-NOTES_MAX_CHARS);

  const c = next.constraints;
  const essentials = next.said.includes("places") && next.said.includes("days");
  const people = c.party.adults + c.party.children;
  const assumed = [
    !next.said.includes("places") && "the places",
    !next.said.includes("days") && "the length",
    !next.said.includes("startDate") && "the start date",
    !next.said.includes("party") && "who is travelling",
    !next.said.includes("budgetEur") && "the budget",
  ].filter((x): x is string => Boolean(x));

  const asked = messages.filter((m) => m.role === "planner").length;
  const follow =
    essentials && asked + 1 < INTAKE_MAX_QUESTIONS
      ? nextQuestion(next.said)
      : null;
  const reply = [
    `Here is what I have: ${c.days} ${c.days === 1 ? "day" : "days"} through ${routeOf(c).map(destinationName).join(" → ")} from ${shortDate(c.startDate)}, for ${people} ${people === 1 ? "person" : "people"}, on about €${c.budgetEur}.`,
    assumed.length
      ? `I assumed ${list(assumed)} — tell me what is different, or correct a card.`
      : "Tell me if anything is off, or build it when it looks right.",
    ...read.refused.map((r) => `${r.name} can’t be part of it: ${r.why}.`),
    follow?.question ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, REPLY_MAX_CHARS);

  return {
    reply,
    state: next,
    unsupported: read.refused.map((r) => r.name),
    ready: essentials && !follow,
    suggestions: follow?.suggestions ?? [],
  };
}
