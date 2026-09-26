import OpenAI from "openai";
import type { ResponseFormatTextJSONSchemaConfig } from "openai/resources/responses/responses";

// The OpenAI client, shared by the calls this product makes: the trip
// composer (src/infra/openai-composer.ts), the watch layer's judge
// (src/infra/openai-judge.ts), the briefing composer
// (src/infra/openai-briefing.ts) and the answer to a traveller's question
// about their trip (src/infra/openai-ask.ts).
//
// The model id lives here rather than in each of them because it is one
// decision, not three. When it lived in two places and the pinned model was
// retired, both paths broke at once and needed the same edit twice.
//
// Pinned to an exact model, never an alias that moves. The judge's quality is
// the product, and `npm run judge:eval` is the only instrument that measures
// it — a model changing underneath that measurement is precisely the drift the
// harness exists to catch. Moving it is a deliberate edit, with the eval re-run.

export const MODEL = "gpt-5.4-mini";

/**
 * How hard the model thinks before it answers. These are reasoning models,
 * which take no `temperature`: effort is the dial instead, and it is set per
 * call because the three calls want different things — the judge is deciding,
 * the two composers are mostly writing.
 */
export type Effort = "low" | "medium" | "high";

/**
 * The SDK retries 408, 409, 429 and 5xx itself with exponential backoff, and
 * honours the server's `retry-after`. Three retries and a 90s ceiling per
 * attempt keep one call well inside the drain's 240s budget; callers with a
 * queue behind them (the judge, via `job`) still get its backoff once these
 * are spent, and callers that do not (trip generation, inside a request) get
 * their only second chances here.
 */
const MAX_RETRIES = 3;
const TIMEOUT_MS = 90_000;

let client: OpenAI | undefined;

export function openai(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  client ??= new OpenAI({
    apiKey,
    maxRetries: MAX_RETRIES,
    timeout: TIMEOUT_MS,
  });
  return client;
}

export type Turn = { role: "user" | "assistant"; content: string };

export type JsonCall = {
  instructions: string;
  input: Turn[];
  /** From `zodTextFormat`: a strict JSON Schema the decoder is held to. */
  format: ResponseFormatTextJSONSchemaConfig;
  effort: Effort;
};

/**
 * One structured call, returned as parsed JSON and nothing more.
 *
 * Parsed, not validated: every caller hands the result to a guard in the domain
 * (`readVerdict`, `readDraft`, the plan schema), so a bad answer is recorded
 * with its reason rather than thrown away here. `responses.parse` would throw
 * on the same answer instead, which is why this uses `create`.
 *
 * `store: false` because the input is a traveller's itinerary, and the
 * Responses API otherwise keeps it on OpenAI's side for thirty days for no use
 * of ours.
 */
export async function generateJson(call: JsonCall): Promise<unknown> {
  const response = await openai().responses.create({
    model: MODEL,
    instructions: call.instructions,
    input: call.input,
    text: { format: call.format },
    reasoning: { effort: call.effort },
    store: false,
  });

  if (response.status === "incomplete") {
    throw new Error(
      `the model stopped early: ${response.incomplete_details?.reason ?? "unknown reason"}`,
    );
  }
  const text = response.output_text;
  if (!text) throw new Error("the model returned no content");
  return JSON.parse(text);
}
