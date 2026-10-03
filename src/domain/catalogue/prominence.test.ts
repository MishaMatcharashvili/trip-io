import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { prominence } from "./prominence.ts";

const base = { tier: "verified" as const, confidence: 0.8, websites: 1 };

describe("prominence", () => {
  test("a castle outranks a cafe of the same standing", () => {
    assert.ok(
      prominence({ ...base, category: "castle" }) >
        prominence({ ...base, category: "cafe" }),
    );
  });

  test("a hand-checked place outranks a verified one, which outranks an unchecked one", () => {
    const at = (tier: "curated" | "verified" | "raw") =>
      prominence({ ...base, category: "museum", tier });
    assert.ok(at("curated") > at("verified"));
    assert.ok(at("verified") > at("raw"));
  });

  test("a place that is well attested and has a site of its own outranks a bare one", () => {
    const rich = prominence({
      category: "winery",
      tier: "verified",
      confidence: 0.95,
      websites: 2,
    });
    const bare = prominence({
      category: "winery",
      tier: "verified",
      confidence: 0.4,
      websites: 0,
    });
    assert.ok(rich > bare);
  });

  test("a place with nothing known about it still has a score", () => {
    const n = prominence({
      category: "museum",
      tier: "raw",
      confidence: null,
      websites: 0,
    });
    assert.ok(n >= 0);
    assert.ok(Number.isFinite(n));
  });

  test("an unlisted category is neither a landmark nor nothing", () => {
    const n = prominence({ ...base, category: "something_new" });
    assert.ok(n > prominence({ ...base, category: "cafe" }) - 20);
  });

  test("it stays between 0 and 100", () => {
    const top = prominence({
      category: "castle",
      tier: "curated",
      confidence: 1,
      websites: 5,
    });
    const low = prominence({
      category: "cafe",
      tier: "raw",
      confidence: 0,
      websites: 0,
    });
    assert.ok(top <= 100 && top > low);
    assert.ok(low >= 0);
  });
});
