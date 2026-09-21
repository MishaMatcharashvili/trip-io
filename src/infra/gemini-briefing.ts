import { z } from "zod";
import type { Briefer, BrieferInput } from "../domain/watch/briefing.ts";
import { briefingDraft } from "../domain/watch/briefing.ts";
import { generate, MODEL } from "./gemini.ts";

// The second model call this product makes on a live trip, and the cheaper one:
// once per trip-day with something to say, against once per matched pair for
// the judge.
//
// Note what it is not given. No places, no coordinates, no catalogue, no
// itinerary beyond the stops of one day, and no evidence strings. It cannot
// propose a change — it can only nominate one the judge already proposed. The
// facts are attached to its answer afterwards (src/domain/watch/briefing.ts),
// so the worst a bad answer can produce is a poor sentence about a real event.

const SYSTEM = `You write one short morning briefing for a traveller in Georgia (the country).

You are given the stops on their day and a numbered list of things the system already
decided are worth telling them. Your whole job is to turn that list into something worth
reading over coffee.

Rules about the list:
- Write about every item. You may cover two items in one line when they are the same
  story — the same weather over two stops — by listing both refs on that line.
- Never write about anything that is not in the list. You have no other information
  about the world, and a reassurance you invent is the one thing that would make the
  rest untrustworthy.
- Order the lines by what the traveller should know first, not by the order given.

Writing:
- greeting is one sentence on the shape of the day: what it looks like overall, and
  whether anything needs attention. This is the only place you write freely.
- Each line has a title — the fact, six to ten words — and a detail: the specifics
  underneath it, times and numbers where you have them.
- Offer the choice, don't sound the alarm. "The trail will be slick until two — the
  monastery reads well in rain", never "WARNING: heavy rain". Never use the words
  warning, alert, danger or urgent.
- Do not repeat the evidence or name the source. It is shown beside your line already.
- No greeting by name, no sign-off, no exclamation marks.

The change:
- At most one item may be nominated as the change worth making, and only an item whose
  hasProposal is true. Write one sentence saying what to do and what it buys them.
- Nominate nothing (null) when no item proposes a move, or when none of them is worth
  rearranging a day over. Most mornings that is the right answer.`;

const userTurn = (input: BrieferInput) =>
  JSON.stringify({
    now: new Date().toISOString(),
    day: { date: input.day.date, ofTrip: input.day.index },
    stops: input.day.stops.map((s) => ({
      at: s.startsAt,
      what: s.title,
      minutes: s.durationMin,
      indoor: s.indoor,
    })),
    traveller: {
      trip: input.trip.title,
      party: input.trip.party,
      pace: input.trip.pace,
      prefs: input.trip.prefs,
    },
    items: input.items,
  });

export const briefWithGemini: Briefer = async (input) => {
  const response = await generate({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: userTurn(input) }] }],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(briefingDraft, { io: "output" }),
      // Higher than the judge's 0.2. The judge is deciding and should be
      // repeatable; this one is only writing, and a briefing that reads
      // identically every morning is a briefing that stops being read.
      temperature: 0.6,
    },
  });

  const text = response.text;
  if (!text) throw new Error("the briefing composer returned no content");
  // Parsed, not checked: the guards live in the domain, so a refused draft
  // becomes the fallback briefing with its reasons recorded rather than an
  // exception that loses the morning.
  return JSON.parse(text);
};
