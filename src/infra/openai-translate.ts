import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Translated, Translator } from "../domain/watch/extraction.ts";
import { generateJson } from "./openai.ts";

// The translator port, on the model the rest of the product already uses.
// Google's Cloud Translation LLM model is the other candidate; it needs a
// service-account token that is not provisioned, and swapping it in is this
// file and nothing else.
//
// A translation here is not a summary. The extractor's quote is checked against
// this text, so a translator that tidied the prose would make the guard pass
// against words nobody printed. The instructions say so, and the guard's
// quote test is what would catch it if they were ignored.

const SYSTEM = `You translate Georgian, Russian and other languages into English for a travel
product that reads news about Georgia (the country).

- Translate everything you are given, faithfully and completely. Do not summarise,
  shorten, merge sentences, add context or correct the article.
- Keep every number, date, time, street name and proper name. Transliterate Georgian
  place names the way English-language news does (Rustaveli Avenue, Stepantsminda,
  Sighnaghi, Kutaisi) and keep the same spelling every time within one text.
- Keep paragraph breaks.
- If the text is already English, return it unchanged and say "en".
- language is the BCP 47 code of the text you were given ("ka", "ru", "en").`;

const schema = z.object({
  language: z.string().min(2).max(12),
  english: z.string(),
});
const FORMAT = zodTextFormat(schema, "translation");

export const translateWithOpenAI: Translator = async (
  text,
): Promise<Translated> => {
  const raw = await generateJson({
    purpose: "translate",
    instructions: SYSTEM,
    input: [{ role: "user", content: text }],
    format: FORMAT,
    // Translation is not deciding anything.
    effort: "low",
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success || parsed.data.english.trim().length === 0) {
    throw new Error("the translator returned nothing usable");
  }
  return parsed.data;
};
