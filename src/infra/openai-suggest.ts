import { zodTextFormat } from "openai/helpers/zod";
import { picksSchema, type Suggester } from "../domain/trip/suggest.ts";
import { generateJson } from "./openai.ts";

// The fifth model call: choosing among changes to one stop. It is given the stop
// in its day and a short list of changes the rules have already checked against
// that day — each with an id and its facts — and returns which to show and why.
// It builds nothing: a change is the ops the rules wrote for that id, so
// whatever it says, only a sound change can reach the traveller.

const SYSTEM = `You help a traveller change one stop of their itinerary in Georgia (the country).

You are given the stop in its day (the stop to change is marked =>), what the traveller asked
for if they said, and a numbered list of options. Each option has an id and its facts. Every
option has already been checked: it fits the day, the opening hours and the daylight.

Choose up to three options that best serve the traveller, best first. If they said what they
want, choose what serves that; otherwise choose the most useful and most different from each
other. For each, write one short reason (under 25 words) in plain words.

Rules:
- Use only the facts given. Do not add facts about the place, the weather or the road.
- Return an option's id exactly as given. Never invent an id.
- Never mention an id in a reason. No exclamation marks, no greeting. Times in 24-hour
  Tbilisi time. Never use the words warning, alert, danger or urgent.
- If no option suits what they asked for, return the closest one or two rather than none.`;

const format = zodTextFormat(picksSchema, "picks");

export const suggestWithOpenAI: Suggester = (input) =>
  generateJson({
    purpose: "suggest",
    instructions: SYSTEM,
    input: [
      {
        role: "user",
        content: `${input.context}\n\nThe traveller asked: ${input.wish ?? "(nothing in particular)"}\n\nOptions:\n${input.options
          .map((o) => `- id ${o.id}: ${o.facts}`)
          .join("\n")}`,
      },
    ],
    format,
    effort: "low",
  });
