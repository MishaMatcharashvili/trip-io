import { zodTextFormat } from "openai/helpers/zod";
import { type Asker, askAnswer } from "../domain/trip/ask.ts";
import { generateJson } from "./openai.ts";

// The fourth model call: a traveller's question about their own trip. It is
// given the trip as plain lines (src/domain/trip/ask.ts) and nothing else, and
// it cannot change the plan — only say what it sees and suggest.

const SYSTEM = `You answer one question from a traveller about their own trip in Georgia (the country).

You are given their itinerary as lines: each day, each stop with its time, length, kind,
whether it is indoors, the place's opening hours when known, and anything the watch layer
has matched to it in [watch: ...].

Rules:
- Answer only from the itinerary you are given and general, stable knowledge about the
  places named in it. You have no live data: no weather, prices, or news beyond what the
  [watch] notes say. If the question needs something you do not have, say so plainly and
  set grounded to false.
- You cannot change the plan. When a change would help, suggest it in one sentence and
  say it can be made in the day editor.
- Be brief: two to four sentences. Times in 24-hour Tbilisi time. No exclamation marks,
  no greeting, no sign-off. Never use the words warning, alert, danger or urgent.`;

const format = zodTextFormat(askAnswer, "answer");

export const askWithOpenAI: Asker = (input) =>
  generateJson({
    instructions: SYSTEM,
    input: [
      {
        role: "user",
        content: `Now: ${input.now}\n\nItinerary:\n${input.context}\n\nQuestion: ${input.question}`,
      },
    ],
    format,
    effort: "low",
  });
