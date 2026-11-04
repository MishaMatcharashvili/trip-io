import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { LocalityFinder } from "../domain/catalogue/localities.ts";
import { findHome } from "./home.ts";

// Two Amaghlebas, as Georgia has: one in Chokhatauri (Guria), one in Vani
// (Imereti). Nothing here calls Google or the database.
const GURIA: [number, number] = [42.1892, 42.0358];
const IMERETI: [number, number] = [42.6228, 42.0928];

const finder = (
  localities = [
    { name: "Amaghleba", lonLat: IMERETI },
    { name: "Amaghleba", lonLat: GURIA },
  ],
): LocalityFinder & { asked: [string, string | undefined][] } => {
  const asked: [string, string | undefined][] = [];
  return {
    provider: "fake",
    configured: true,
    asked,
    async find(name, near) {
      asked.push([name, near]);
      return { ok: true, localities };
    },
  };
};

const deps = {
  regionAt: async (at: [number, number]) =>
    at === GURIA ? "chokhatauri" : "vani",
  inArea: async (at: [number, number], match: { kind: string }) =>
    at === GURIA && (match.kind === "isoRegion" || match.kind === "regions"),
};

describe("findHome", () => {
  test("keeps the namesake on the route, and says which of its places hold it", async () => {
    const find = finder();
    const found = await findHome(find, "Amaghleba", ["tbilisi", "guria"], deps);
    assert.deepEqual(found, {
      home: { name: "Amaghleba", lonLat: GURIA, place: "chokhatauri" },
      within: ["guria"],
    });
    // The route's places tell namesakes apart; Tbilisi tells nothing.
    assert.deepEqual(find.asked, [["Amaghleba", "Guria"]]);
  });

  test("with no route said, the first match", async () => {
    const found = await findHome(finder(), "Amaghleba", [], deps);
    assert.equal(found?.home.place, "vani");
  });

  test("none on the route is none, and a provider down is nothing found", async () => {
    assert.equal(
      await findHome(
        finder([{ name: "Amaghleba", lonLat: IMERETI }]),
        "Amaghleba",
        ["guria"],
        deps,
      ),
      null,
    );
    const down: LocalityFinder = {
      provider: "fake",
      configured: true,
      find: async () => ({ ok: false, reason: "unavailable" }),
    };
    assert.equal(await findHome(down, "Amaghleba", ["guria"], deps), null);
  });
});
