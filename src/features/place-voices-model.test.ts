import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  excerpt,
  failureNote,
  reviewDate,
  reviewLine,
} from "./place-voices-model.ts";

describe("excerpt", () => {
  test("a short review is shown whole, with its whitespace tidied", () => {
    assert.equal(excerpt("Great\n\n  courtyard"), "Great courtyard");
  });

  test("a long one is cut at a word, with an ellipsis", () => {
    const cut = excerpt("word ".repeat(100), 50);
    assert.ok(cut.endsWith("…"));
    assert.ok(cut.length <= 51);
    assert.ok(!cut.includes("wor…"));
  });

  test("one long word with no gap is cut where it must be", () => {
    assert.equal(excerpt("x".repeat(100), 10), `${"x".repeat(10)}…`);
  });
});

describe("dates", () => {
  test("month and year", () => {
    assert.equal(reviewDate("2030-04-02T10:00:00Z"), "Apr 2030");
  });

  test("nonsense is no date", () => {
    assert.equal(reviewDate("soon"), "");
  });

  test("the line leaves out what it does not have", () => {
    assert.equal(
      reviewLine({
        id: "1",
        rating: 5,
        ratingIcon: null,
        title: null,
        text: "x",
        publishedAt: "2030-04-02T10:00:00Z",
        tripType: null,
        author: "mari",
        url: null,
      }),
      "Apr 2030 · mari",
    );
  });
});

test("only a busy or broken answer is worth trying again", () => {
  assert.equal(failureNote("rate-limited").canRetry, true);
  assert.equal(failureNote("timeout").canRetry, true);
  assert.equal(failureNote("quota").canRetry, false);
  assert.equal(failureNote("auth").canRetry, false);
});
