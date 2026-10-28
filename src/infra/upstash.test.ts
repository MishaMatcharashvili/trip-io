import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { EnrichOutcome } from "../domain/catalogue/enrichment.ts";
import type { RatedOutcome } from "../domain/catalogue/ratings.ts";
import { upstashContent, upstashRatings } from "./upstash.ts";

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
    provider: "tripadvisor",
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
    assert.equal(set.args[1], `place-enrichment:v2:tripadvisor:${PLACE}`);
    assert.deepEqual(set.args.slice(3), ["EX", 3_600]);
  });

  test("two providers' answers for one place are kept apart", async () => {
    const f = fake();
    await store(f).set(PLACE, outcome, 60);
    assert.equal(await store(f, { provider: "google" }).get(PLACE), null);
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
      `place-enrichment:v2:tripadvisor:${PLACE}`,
      JSON.stringify({ v: 0, outcome }),
    );
    assert.equal(await store(f).get(PLACE), null);
    f.data.set(`place-enrichment:v2:tripadvisor:${PLACE}`, "not json");
    assert.equal(await store(f).get(PLACE), null);
    f.data.set(
      `place-enrichment:v2:tripadvisor:${PLACE}`,
      JSON.stringify({ v: 2, outcome: 5 }),
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
        provider: "tripadvisor",
        fetch: slow,
        timeoutMs: 10,
      }).get(PLACE),
    );
  });
});

describe("upstash ratings", () => {
  const town: RatedOutcome = {
    ok: true,
    places: [
      {
        id: "ChIJpalaty",
        names: ["Palaty"],
        lonLat: [42.7004, 42.2716],
        rating: { value: 4.6, count: 2400 },
      },
    ],
  };
  const ratings = (f: ReturnType<typeof fake>) =>
    upstashRatings({
      url: "https://redis.example",
      token: "tok",
      provider: "google",
      fetch: f.fetch,
    });

  test("a town's list comes back, under a versioned key of its own, with a lifetime", async () => {
    const f = fake();
    await ratings(f).set("kutaisi:restaurant", town, 86_400);
    assert.deepEqual(await ratings(f).get("kutaisi:restaurant"), town);
    const [set] = f.sent;
    assert.equal(set.args[1], "place-ratings:v1:google:kutaisi:restaurant");
    assert.deepEqual(set.args.slice(3), ["EX", 86_400]);
  });

  test("a place's enrichment is never read as a town's list", async () => {
    const f = fake();
    f.data.set(
      "place-ratings:v1:google:kutaisi:hotel",
      JSON.stringify({ v: 2, outcome }),
    );
    assert.equal(await ratings(f).get("kutaisi:hotel"), null);
  });
});
