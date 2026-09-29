import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MAX_STOPS, type RouteAnswer } from "../../domain/route/contract.ts";
import { createRouteClient, type Fetcher, FRESH_MS } from "./route-client.ts";

const stops = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    lonLat: [44 + i * 0.01, 41.7] as [number, number],
  }));

const answerFor = (n: number): RouteAnswer => ({
  routes: [
    {
      distanceM: 100 * n,
      durationS: 10 * n,
      staticDurationS: null,
      path: [
        [44, 41.7],
        [44.1, 41.7],
      ],
      legs: Array.from({ length: n }, () => ({
        distanceM: 100,
        durationS: 10,
        staticDurationS: null,
        path: [
          [44, 41.7],
          [44.1, 41.7],
        ] as [number, number][],
      })),
      description: null,
      labels: [],
      warnings: [],
    },
  ],
  mode: "drive",
  traffic: "live",
  computedAt: "2030-01-01T00:00:00.000Z",
  fallback: null,
});

const counting = () => {
  const seen: number[] = [];
  const fetcher: Fetcher = async (req) => {
    seen.push(req.stops.length);
    return { ok: true, answer: answerFor(req.stops.length - 1) };
  };
  return { seen, fetcher };
};

describe("route client", () => {
  test("asks once for a route, and not again for the same stops", async () => {
    const { seen, fetcher } = counting();
    const client = createRouteClient(fetcher);
    await client.route({ stops: stops(3) });
    await client.route({ stops: stops(3) });
    assert.equal(seen.length, 1);
  });

  test("a question already on its way is joined, not repeated", async () => {
    let calls = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const client = createRouteClient(async () => {
      calls++;
      await gate;
      return { ok: true, answer: answerFor(1) };
    });
    const a = client.route({ stops: stops(2) });
    const b = client.route({ stops: stops(2) });
    open();
    await Promise.all([a, b]);
    assert.equal(calls, 1);
  });

  test("different stops, or a different order, are different questions", async () => {
    const { seen, fetcher } = counting();
    const client = createRouteClient(fetcher);
    await client.route({ stops: stops(3) });
    await client.route({ stops: [...stops(3)].reverse() });
    await client.route({ stops: stops(4) });
    assert.equal(seen.length, 3);
  });

  test("an answer goes stale after the window, and refresh asks at once", async () => {
    const { seen, fetcher } = counting();
    let now = 0;
    const client = createRouteClient(fetcher, () => now);
    await client.route({ stops: stops(2) });
    now = FRESH_MS - 1;
    await client.route({ stops: stops(2) });
    assert.equal(seen.length, 1);
    await client.route({ stops: stops(2), refresh: true });
    assert.equal(seen.length, 2);
    now = FRESH_MS * 3;
    await client.route({ stops: stops(2) });
    assert.equal(seen.length, 3);
  });

  test("a failure is reported and not remembered", async () => {
    let fail = true;
    let calls = 0;
    const client = createRouteClient(async () => {
      calls++;
      return fail
        ? { ok: false, reason: "upstream" }
        : { ok: true, answer: answerFor(1) };
    });
    assert.deepEqual(await client.route({ stops: stops(2) }), {
      ok: false,
      reason: "upstream",
    });
    fail = false;
    assert.ok((await client.route({ stops: stops(2) })).ok);
    assert.equal(calls, 2);
  });

  test("more stops than one request takes go as several, and come back as one route", async () => {
    const { seen, fetcher } = counting();
    const client = createRouteClient(fetcher);
    const out = await client.route({ stops: stops(MAX_STOPS + 4) });
    assert.deepEqual(seen, [MAX_STOPS, 5]);
    assert.ok(out.ok);
    if (out.ok) assert.equal(out.answer.routes[0].legs.length, MAX_STOPS + 3);
  });

  test("alternatives are asked for between two stops only", async () => {
    const asked: (boolean | undefined)[] = [];
    const client = createRouteClient(async (req) => {
      asked.push(req.alternatives);
      return { ok: true, answer: answerFor(req.stops.length - 1) };
    });
    await client.route({ stops: stops(2), alternatives: true });
    await client.route({ stops: stops(4), alternatives: true });
    assert.deepEqual(asked, [true, false]);
  });

  test("fewer than two stops is nothing to ask", async () => {
    const { seen, fetcher } = counting();
    const out = await createRouteClient(fetcher).route({ stops: stops(1) });
    assert.equal(out.ok, false);
    assert.equal(seen.length, 0);
  });
});
