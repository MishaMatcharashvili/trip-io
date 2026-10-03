import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  type ExtractionInput,
  type Extractor,
  extractableKinds,
} from "../domain/watch/extraction.ts";
import { generateJson } from "./openai.ts";

// Detectors 3 and 4's model call. It finds claims and quotes the sentence each
// rests on; everything about whether a claim may become an event is a guard in
// src/domain/watch/extraction.ts. Nothing here is trusted: the schema is only
// there so the answer parses, and the guards re-read it from scratch.

const COMMON = `You read one news item about Georgia (the country), already in English, and
extract scheduled things that would change a traveller's day. The item may be about
something else entirely, which is the usual case: return an empty list then.

For each thing, give:
- kind: one of the kinds listed below.
- place: where, as the item names it — a street, a district, a town. If the item names
  no place you can point to, leave the thing out.
- startsAt, endsAt: ISO 8601 with the offset +04:00 (Tbilisi has no daylight saving).
  Resolve "tomorrow" and "on Saturday" from the date you are given as now. If the item
  gives a start but no end, end it the same evening at 23:00 unless it says otherwise.
  Leave the thing out if the item gives no date you can resolve.
- summary: one factual sentence saying what is scheduled and where.
- quote: the sentence the claim rests on, copied exactly from the item, character for
  character. It is checked against the item; a quote that is not there discards the claim.
- confidence: how sure you are that it is happening as stated.

Never invent a detail the item does not state. Never describe a place or a group of
people as dangerous or unsafe; state what is scheduled. At most ten things.`;

const INSTRUCTIONS: Record<ExtractionInput["detector"], string> = {
  events: `${COMMON}

Kinds for this task:
- event.festival: a festival, parade, concert, market, race or celebration a visitor could
  attend or would notice.
- event.closure: a street, square, site or road closed or restricted because of an event.
Ignore politics, crime, court cases, business news and sport results.`,
  safety: `${COMMON}

Kinds for this task:
- safety.demonstration: a demonstration, rally, march or strike announced for a time and
  place.
- safety.advisory: an official advisory or warning for a named area and time.
Report only what is announced or scheduled, with the time and place it names.`,
};

// The model is shown loose strings: dates and kinds are validated by the guards,
// and a strict date-time or enum here would turn a near miss into a refused
// response instead of a recorded rejection.
const schema = z.object({
  items: z.array(
    z.object({
      kind: z.string(),
      place: z.string(),
      startsAt: z.string(),
      endsAt: z.string(),
      summary: z.string(),
      quote: z.string(),
      confidence: z.number(),
    }),
  ),
});
const FORMAT = zodTextFormat(schema, "extraction");

const userTurn = (input: ExtractionInput) =>
  JSON.stringify({
    now: input.now,
    kinds: extractableKinds.filter((k) =>
      input.detector === "events"
        ? k.startsWith("event.")
        : k.startsWith("safety."),
    ),
    publishedAt: input.publishedAt,
    outlet: input.source,
    item: input.text,
  });

export const extractWithOpenAI: Extractor = (input) =>
  generateJson({
    instructions: INSTRUCTIONS[input.detector],
    input: [{ role: "user", content: userTurn(input) }],
    format: FORMAT,
    // Reading for facts, not deciding: the guards decide.
    effort: "low",
  });
