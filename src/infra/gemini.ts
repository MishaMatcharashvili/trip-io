import { GoogleGenAI } from "@google/genai";

// The Gemini client, shared by the two calls this product makes: the trip
// composer (src/infra/gemini-composer.ts) and the watch layer's judge
// (src/infra/gemini-judge.ts).
//
// The model id lives here rather than in each of them because it is one
// decision, not two. It was two, and when the pinned model was retired both
// paths broke at once and needed the same edit in two places.
//
// Pinned to an exact version, never an alias like `gemini-flash-latest`. The
// judge's quality is the product, and `npm run judge:eval` is the only
// instrument that measures it — an alias would let the model change underneath
// that measurement, which is precisely the drift the harness exists to catch.
// Moving it is therefore a deliberate edit, reviewed, with the eval re-run.

export const MODEL = "gemini-3.8-flash";

let client: GoogleGenAI | undefined;

export function genai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

type GenerateParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];
type GenerateResult = Awaited<
  ReturnType<GoogleGenAI["models"]["generateContent"]>
>;

/**
 * Transient statuses. 429 is the one that actually bites: the free tier allows
 * five requests a minute, and both bulk callers — the eval harness over thirty
 * fixtures, and the drain judging a backlog — exceed that without trying.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const MAX_ATTEMPTS = 5;
/** Never sit on a request longer than this; the drain has 240s for everything. */
const MAX_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The SDK surfaces the API's JSON in the error message; read it defensively. */
function statusOf(error: unknown): number | null {
  const message = (error as Error)?.message ?? String(error);
  const match = message.match(/"code"\s*:\s*(\d{3})/);
  return match ? Number(match[1]) : null;
}

/**
 * The API says how long to wait (`RetryInfo.retryDelay`). Honouring it rather
 * than guessing is what lets the same code run unthrottled on a paid key and
 * politely on a free one.
 */
function serverDelayMs(error: unknown): number | null {
  const message = (error as Error)?.message ?? String(error);
  const match = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return match ? Math.ceil(Number(match[1]) * 1000) : null;
}

/**
 * One model call, retried on the statuses worth retrying. Callers that have a
 * queue behind them (the judge, via `job`) still get its exponential backoff
 * when these attempts are exhausted; callers that do not (trip generation,
 * inside a request) get their only second chance here.
 */
export async function generate(
  params: GenerateParams,
): Promise<GenerateResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await genai().models.generateContent(params);
    } catch (error) {
      const status = statusOf(error);
      if (status === null || !RETRYABLE.has(status)) throw error;
      if (attempt >= MAX_ATTEMPTS) throw error;

      const wait = Math.min(
        serverDelayMs(error) ?? 2 ** attempt * 1000,
        MAX_BACKOFF_MS,
      );
      await sleep(wait + 250);
    }
  }
}
