import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { money, watchOffer } from "./pricing.ts";

describe("watchOffer", () => {
  test("a watched trip is offered nothing", () => {
    assert.deepEqual(watchOffer({ pass: "paid", passesHeld: 3 }), {
      kind: "watched",
      pass: "paid",
    });
  });

  test("the first trip is free", () => {
    assert.deepEqual(watchOffer({ pass: null, passesHeld: 0 }), {
      kind: "free",
    });
  });

  test("after that, each trip has the price", () => {
    const offer = watchOffer({ pass: null, passesHeld: 1 });
    assert.equal(offer.kind, "paid");
    assert.equal(
      offer.kind === "paid" && money(offer.cents, offer.currency),
      "$5",
    );
  });
});
