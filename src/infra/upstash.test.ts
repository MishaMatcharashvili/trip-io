import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EnrichOutcome } from "../domain/catalogue/enrichment.ts";
import { upstashContent } from "./upstash.ts";

// MOCKED: a fake Upstash that keeps what it is sent and answers in its shape.

const PLACE = "11111111-1111-4111-8111-111111111111";
const outcome: EnrichOutcome = {
  ok: true,
  enrichment: {
    source: { name: "Tripadvisor", url: "https://www.tripadvisor.com/x" },
    rating: { value: 4.5, count: 10, icon: null },
    ranking: null,
    url: "https://www.tripadvisor.com/x",
    reviews: [],
    photos: [],
  },
};

function fake(reply?: (args: unknown[]) => Response) {
  const data = new Map<string, string>();
  const sent: { args: unknown[]; init: RequestInit; url: string }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    const args = JSON.parse(String(init.body)) as unknown[];
    sent.push({ args, init, url });
    if (reply) return reply(args);
    if (args[0] === "SET") {
      data.set(String(args[1]), String(args[2]));
      return Response.json({ result: "OK" });
    }
    return Response.json({ result: data.get(String(args[1])) ?? null });
  }) as unknown as typeof fetch;
  return { fetch: fetcher, sent, data };
}

const store = (f: ReturnType<typeof fake>, extra = {}) =>
  upstashContent({
    url: "https://redis.example",
    token: "tok",
    fetch: f.fetch,
    ...extra,
  });

describe("upstash content", () => {
  test("what is set comes back, under a versioned key, with a lifetime", async () => {
    const f = fake();
    const kept = store(f);
    await kept.set(PLACE, outcome, 3_600);
    assert.deepEqual(await kept.get(PLACE), outcome);
    const [set] = f.sent;
    assert.equal(set.args[0], "SET");
    assert.equal(set.args[1], `place-enrichment:v1:${PLACE}`);
    assert.deepEqual(set.args.slice(3), ["EX", 3_600]);
  });

  test("the token is a bearer header and nothing else", async () => {
    const f = fake();
    await store(f).get(PLACE);
    const [{ init, url, args }] = f.sent;
    assert.equal(
      (init.headers as Record<string, string>).Authorization,
      "Bearer tok",
    );
    assert.ok(!url.includes("tok"));
    assert.ok(!JSON.stringify(args).includes("tok"));
  });

  test("a lifetime is whole seconds and at least one", async () => {
    const f = fake();
    await store(f).set(PLACE, outcome, 0.2);
    assert.equal(f.sent[0].args[4], 1);
  });

  test("nothing kept is null", async () => {
    assert.equal(await store(fake()).get(PLACE), null);
  });

  test("an entry from another version, or not ours, is not read", async () => {
    const f = fake();
    f.data.set(
      `place-enrichment:v1:${PLACE}`,
      JSON.stringify({ v: 0, outcome }),
    );
    assert.equal(await store(f).get(PLACE), null);
    f.data.set(`place-enrichment:v1:${PLACE}`, "not json");
    assert.equal(await store(f).get(PLACE), null);
    f.data.set(
      `place-enrichment:v1:${PLACE}`,
      JSON.stringify({ v: 1, outcome: 5 }),
    );
    assert.equal(await store(f).get(PLACE), null);
  });

  test("a refusal or a bad status throws, for the caller to treat as a miss", async () => {
    await assert.rejects(
      store(fake(() => new Response("no", { status: 401 }))).get(PLACE),
    );
    await assert.rejects(
      store(fake(() => Response.json({ error: "WRONGPASS secret" }))).get(
        PLACE,
      ),
      (e: Error) => !e.message.includes("secret"),
    );
  });

  test("a slow store is a timeout, not a hang", async () => {
    const slow = (async (_: unknown, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      })) as unknown as typeof fetch;
    await assert.rejects(
      upstashContent({
        url: "https://redis.example",
        token: "t",
        fetch: slow,
        timeoutMs: 10,
      }).get(PLACE),
    );
  });
});
