import { GoogleGenAI } from "@google/genai";

// The Gemini client, shared by the two calls this product makes: the trip
// composer (src/infra/gemini-composer.ts) and the watch layer's judge
// (src/infra/gemini-judge.ts).
//
// The model id lives here rather than in each of them because it is one
// decision, not two. It was two, and when the pinned model was retired both
// paths broke at once and needed the same edit in two places.

export const MODEL = "gemini-2.0-flash";

let client: GoogleGenAI | undefined;

export function genai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}
