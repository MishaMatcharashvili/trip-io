import { zodTextFormat } from "openai/helpers/zod";
import type { Judge, JudgeInput } from "../domain/watch/judge.ts";
import { verdict } from "../domain/watch/judge.ts";
import { generateJson } from "./openai.ts";

// The only model call in the watch pipeline, and the only one that runs per
// matched pair rather than per region. Everything in the architecture upstream
// of here — sensing per region, matching in SQL, the radius dial — exists to
// keep the number of times this function is called small.
//
// It implements the domain's `Judge` port and knows nothing else: the guards
// that decide whether its answer is usable are in src/domain/watch/judge.ts,
// where they can be tested without a key.

const SYSTEM = `You advise travellers in Georgia (the country) whose plans a real-world event may affect.

You are shown ONE event and ONE stop on a traveller's itinerary. Decide whether that
event actually changes anything for that stop, and if it does, propose the smallest
change that fixes it.

Judging:
- Most events do not matter. Rain does not affect a museum; wind does not affect lunch;
  a forecast for the far side of a valley does not affect a city walk. Say relevant: false
  and stop. This is the common, correct answer.
- "blocks" means the stop cannot happen. "degrades" means it can, but worse.
  "improves" means the event makes it better than planned. Use "none" only with
  relevant: false — a relevant event with no impact is rejected.
- horizonHrs is how many hours from now the traveller would have to act. A change to
  tomorrow afternoon has a long horizon even if the weather is severe.
- confidence is yours, about your own judgement — not a restatement of the forecast's.

Writing:
- oneLine is one sentence the traveller reads. Say what is happening and what it means
  for this stop. Offer the choice, don't sound the alarm: "the trail will be slick until
  two — the monastery reads well in rain" rather than "WARNING: heavy rain".
- Never use the words warning, alert, danger or urgent.
- evidence must name the source and carry its timestamp, exactly as given to you. It is
  shown beside your sentence so the traveller can check you.

Proposing:
- proposals is a list of moves, applied together and accepted or rejected as one.
  Propose nothing (an empty list) when the event is worth knowing but nothing needs to
  move — that is a normal answer.
- shift: move a stop earlier or later, in minutes. Negative is earlier.
- swap: replace a stop's place with one of the alternatives you were given. You may ONLY
  use a placeId from that list. Never invent one, and never reuse an id from elsewhere in
  the input. Set indoor to match the alternative you chose.
- shorten: cut a stop's duration.
- drop: remove a stop entirely. Use this sparingly; a traveller came to do these things.
- If moving one stop collides with another stop on the same day, propose the moves for
  both. The traveller sees one diff.
- Keep meals near mealtimes and do not push an outdoor stop past dusk.`;

/** Everything the model is shown. Nothing else about the trip reaches it. */
const userTurn = (input: JudgeInput) =>
  JSON.stringify({
    now: new Date().toISOString(),
    event: {
      what: input.event.kind,
      severity: input.event.severity,
      forecastConfidence: input.event.confidence,
      from: input.event.validFrom,
      to: input.event.validTo,
      source: input.event.source,
      observedAt: input.event.observedAt,
      detail: input.event.payload,
    },
    stop: {
      nodeId: input.node.id,
      kind: input.node.kind,
      what: input.node.placeName ?? input.node.title,
      startsAt: input.node.startsAt,
      durationMin: input.node.durationMin,
      indoor: input.node.indoor,
      corridor: input.node.corridorSlug,
    },
    traveller: {
      party: input.trip.party,
      pace: input.trip.pace,
      prefs: input.trip.prefs,
    },
    restOfDay: input.trip.day,
    alternatives: input.alternatives,
  });

const FORMAT = zodTextFormat(verdict, "verdict");

export const judgeWithOpenAI: Judge = (input) =>
  generateJson({
    instructions: SYSTEM,
    input: [{ role: "user", content: userTurn(input) }],
    format: FORMAT,
    // Medium, not low: this is the call that decides whether anyone hears
    // about anything, and the one the eval harness scores. The composers only
    // write, and run on less.
    effort: "medium",
  });
