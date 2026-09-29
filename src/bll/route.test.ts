import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  type RouteAnswer,
  type RouteOutcome,
  routeRequest,
} from "../domain/route/contract.ts";
import { computeRoute, type RouteDeps, type RouteLog } from "./route.ts";

const NOW = new Date("2030-05-01T06:00:00Z");
const request = (extra = {}) =>
  routeRequest.parse({
    stops: [{ lonLat: [44.8271, 41.7151] }, { lonLat: [44.7211, 41.8457] }],
    ...extra,
  });

const answer: RouteAnswer = {
  routes: [],
  stops: [],
  mode: "drive",
  traffic: "live",
  computedAt: NOW.toISOString(),
};

function harness(
  overrides: Partial<RouteDeps> & { outcome?: RouteOutcome } = {},
) {
  const calls: unknown[] = [];
  const counts = new Map<string, number>();
  const logs: RouteLog[] = [];
  const deps: Pick<RouteDeps, "provider"> & Partial<RouteDeps> = {
    provider: {
      configured: true,
      compute: async (req) => {
        calls.push(req);
        return overrides.outcome ?? { ok: true, answer };
      },
    },
    count: async (key) => {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts.get(key) as number;
    },
    now: () => NOW,
    limits: {
      userPerMinute: 3,
      userPerDay: 10,
      globalPerMinute: 100,
      globalPerDay: 100,
    },
    log: (e) => logs.push(e),
    ...overrides,
  };
  return { deps, calls, counts, logs };
}

describe("computeRoute", () => {
  test("asks the provider once and returns its answer", async () => {
    const h = harness();
    const out = await computeRoute(request(), "u1", h.deps);
    assert.deepEqual(out, { ok: true, answer });
    assert.equal(h.calls.length, 1);
  });

  test("refuses a departure in the past before spending anything", async () => {
    const h = harness();
    const out = await computeRoute(
      request({ departure: "2030-04-30T06:00:00Z" }),
      "u1",
      h.deps,
    );
    assert.deepEqual(out, { ok: false, reason: "invalid" });
    assert.equal(h.calls.length, 0);
    assert.equal(h.counts.size, 0);
  });

  test("without a credential it says so and counts nothing", async () => {
    const h = harness({
      provider: { configured: false, compute: async () => assert.fail() },
    });
    assert.deepEqual(await computeRoute(request(), "u1", h.deps), {
      ok: false,
      reason: "not-configured",
    });
    assert.equal(h.counts.size, 0);
  });

  test("a traveller past their per-minute allowance is refused without a provider call", async () => {
    const h = harness();
    for (let i = 0; i < 3; i++) {
      const stops = [{ lonLat: [44 + i * 0.1, 41.7] }, { lonLat: [45, 41.8] }];
      assert.ok((await computeRoute(request({ stops }), "u1", h.deps)).ok);
    }
    const fourth = await computeRoute(
      request({ stops: [{ lonLat: [44.9, 41.7] }, { lonLat: [45, 41.8] }] }),
      "u1",
      h.deps,
    );
    assert.deepEqual(fourth, { ok: false, reason: "rate-limited" });
    assert.equal(h.calls.length, 3);
    // Someone else is unaffected.
    assert.ok((await computeRoute(request(), "u2", h.deps)).ok);
  });

  test("the day's total stops everyone, and is reported as quota", async () => {
    const h = harness({
      limits: {
        userPerMinute: 99,
        userPerDay: 99,
        globalPerMinute: 99,
        globalPerDay: 1,
      },
    });
    const a = [{ lonLat: [44.1, 41.7] }, { lonLat: [45, 41.8] }];
    const b = [{ lonLat: [44.2, 41.7] }, { lonLat: [45, 41.8] }];
    assert.ok((await computeRoute(request({ stops: a }), "u1", h.deps)).ok);
    assert.deepEqual(await computeRoute(request({ stops: b }), "u2", h.deps), {
      ok: false,
      reason: "quota",
    });
    assert.equal(h.calls.length, 1);
  });

  test("a busy minute stops everyone before the provider's own limit does", async () => {
    const h = harness({
      limits: {
        userPerMinute: 99,
        userPerDay: 99,
        globalPerMinute: 1,
        globalPerDay: 99,
      },
    });
    const a = [{ lonLat: [44.1, 41.7] }, { lonLat: [45, 41.8] }];
    const b = [{ lonLat: [44.2, 41.7] }, { lonLat: [45, 41.8] }];
    assert.ok((await computeRoute(request({ stops: a }), "u1", h.deps)).ok);
    assert.deepEqual(await computeRoute(request({ stops: b }), "u2", h.deps), {
      ok: false,
      reason: "quota",
    });
    assert.equal(h.calls.length, 1);
  });

  test("identical requests in flight share one provider call", async () => {
    let calls = 0;
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const h = harness({
      provider: {
        configured: true,
        compute: async () => {
          calls++;
          await gate;
          return { ok: true, answer };
        },
      },
    });
    const [a, b] = [
      computeRoute(request(), "u1", h.deps),
      computeRoute(request(), "u2", h.deps),
    ];
    await new Promise((r) => setTimeout(r, 10));
    open();
    assert.deepEqual(await a, await b);
    assert.equal(calls, 1);
    assert.equal(h.counts.get("routes:all"), 1);
    // Once answered it is not remembered: the next request asks again.
    await computeRoute(request(), "u1", h.deps);
    assert.equal(calls, 2);
  });

  test("passes the provider's failure through untouched", async () => {
    const h = harness({ outcome: { ok: false, reason: "auth" } });
    assert.deepEqual(await computeRoute(request(), "u1", h.deps), {
      ok: false,
      reason: "auth",
    });
  });

  test("a failure that belongs to one stop keeps saying which", async () => {
    const h = harness({
      outcome: { ok: false, reason: "unroutable-stop", stop: 1 },
    });
    assert.deepEqual(await computeRoute(request(), "u1", h.deps), {
      ok: false,
      reason: "unroutable-stop",
      stop: 1,
    });
  });

  test("logs the kind of call, never where it went", async () => {
    const h = harness();
    await computeRoute(request(), "u1", h.deps);
    assert.equal(h.logs.length, 1);
    assert.deepEqual(Object.keys(h.logs[0]).sort(), [
      "category",
      "latencyMs",
      "mode",
      "result",
      "waypoints",
    ]);
    assert.equal(h.logs[0].waypoints, 2);
  });
});
