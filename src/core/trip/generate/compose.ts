import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ComposeFeedback, ComposeInput, Composer } from "./pipeline.ts";
import { planSchema, type RefPlan } from "./plan.ts";

// The only model call in trip generation, and the only file that knows which
// provider we use. Everything else takes a `Composer`.
//
// The model chooses places and their order; it never sets clock times —
// `schedule.ts` does that, because models are weak at time arithmetic and the
// result has to satisfy the coherent-day validator either way.

export const MODEL = "gemini-2.0-flash";

const SYSTEM = `You compose day-by-day itineraries for travellers in Georgia (the country).

Rules:
- Choose places ONLY from the candidate list, by their "ref". Never invent a place or a ref.
- Each day: pick one "stayRef" (the base for the night, a lodging candidate). Keep the same base
  on consecutive days unless the trip is moving on — changing base costs half a day.
- Keep a day's stops close together. A day should not criss-cross a region.
- Put each stop in the slot that suits it: morning, midday (lunch), afternoon, evening (dinner).
  Every full day should have a midday and an evening meal.
- Respect the hours given for each candidate, and the dawn/dusk times given for each day: an
  outdoor visit has to finish before dusk.
- durationMin is how long the traveller spends there: a viewpoint 30-45, a church or museum 60-90,
  a hike or a national park 150-240, lunch 60-75, dinner 75-90.
- Favour the traveller's stated interests, and match the pace: relaxed means fewer stops.
- Do not set clock times. Slots and durations are enough.`;

const userTurn = (input: ComposeInput) =>
  JSON.stringify({
    trip: {
      days: input.constraints.days,
      pace: input.constraints.pace,
      interests: input.constraints.interests,
      party: input.constraints.party,
      mobility: input.constraints.mobility,
      budgetEur: input.constraints.budgetEur,
    },
    days: input.days,
    candidates: input.candidates.map((c) => ({
      ref: c.ref,
      name: c.name,
      kind: c.category,
      group: c.group,
      area: c.area,
      outdoor: c.outdoor,
      hours: c.hours,
      lon: Number(c.lonLat[0].toFixed(4)),
      lat: Number(c.lonLat[1].toFixed(4)),
    })),
  });

const retryTurn = (feedback: ComposeFeedback) =>
  [
    "That plan was rejected. Fix it and return the whole plan again.",
    feedback.invented.length
      ? `These refs are not in the candidate list: ${feedback.invented.join(", ")}. Only use refs from the list.`
      : "",
    feedback.problems.length
      ? `Problems found when the plan was scheduled and checked:\n- ${feedback.problems.join("\n- ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

let client: GoogleGenAI | undefined;
function genai() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export const composeWithGemini: Composer = async (input, feedback) => {
  // The refs become an enum in the response schema, so an invented place is
  // impossible at decoding time. The pipeline checks again anyway: cached and
  // fallback plans don't pass through here.
  const refs = input.candidates.map((c) => c.ref);
  const schema = planSchema(
    refs.length > 0 ? z.enum(refs as [string, ...string[]]) : z.string(),
  );

  const previous = feedback ? JSON.stringify(feedback.previous) : null;
  const response = await genai().models.generateContent({
    model: MODEL,
    contents: [
      { role: "user", parts: [{ text: userTurn(input) }] },
      ...(previous
        ? [
            { role: "model", parts: [{ text: previous }] },
            {
              role: "user",
              parts: [{ text: retryTurn(feedback as ComposeFeedback) }],
            },
          ]
        : []),
    ],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(schema, { io: "output" }),
      temperature: 0.4,
    },
  });

  const text = response.text;
  if (!text) throw new Error("the model returned no content");
  return schema.parse(JSON.parse(text)) as RefPlan;
};
