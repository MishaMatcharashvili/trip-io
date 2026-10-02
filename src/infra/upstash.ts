import type {
  EnrichOutcome,
  KeptContent,
} from "../domain/catalogue/enrichment.ts";

// Redis over Upstash's REST API, behind the domain's KeptContent port. HTTP and
// not a TCP client: a serverless function that opens a socket per invocation
// exhausts a small Redis's connections, and Vercel's own Redis is Upstash's.
//
// A command is a JSON array POSTed to the database's URL with the token as a
// bearer; the answer is `{ result }` or `{ error }`. Two commands are used, GET
// and SET with EX, so what is kept always has a lifetime and never outstays it.
//
// Failures throw, and the use case treats every throw as a miss. The timeout is
// short on purpose: a store slower than the provider it is meant to spare is
// worse than none.

const TIMEOUT_MS = 1_500;

/**
 * The key's version is part of it. A change to what is stored (Enrichment's
 * shape) bumps it, and old entries are never read by new code: they age out.
 */
const VERSION = 1;
const keyFor = (placeId: string) => `place-enrichment:v${VERSION}:${placeId}`;

export function upstashContent(options: {
  url: string;
  token: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): KeptContent {
  const { url, token, timeoutMs = TIMEOUT_MS } = options;
  const send = options.fetch ?? fetch;

  async function command(args: (string | number)[]): Promise<unknown> {
    const res = await send(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    // Never include the body or the URL in the error: either can carry the token.
    if (!res.ok) throw new Error(`redis ${res.status}`);
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (body.error) throw new Error("redis refused the command");
    return body.result ?? null;
  }

  return {
    async get(placeId) {
      const raw = await command(["GET", keyFor(placeId)]);
      if (typeof raw !== "string") return null;
      try {
        const kept = JSON.parse(raw) as {
          v?: number;
          outcome?: EnrichOutcome;
        };
        // Something this code did not write, or an older shape: not trusted.
        return kept.v === VERSION && typeof kept.outcome?.ok === "boolean"
          ? kept.outcome
          : null;
      } catch {
        return null;
      }
    },

    async set(placeId, outcome, ttlSeconds) {
      const ttl = Math.max(1, Math.floor(ttlSeconds));
      await command([
        "SET",
        keyFor(placeId),
        JSON.stringify({ v: VERSION, outcome }),
        "EX",
        ttl,
      ]);
    },
  };
}
