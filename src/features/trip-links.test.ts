import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dayHref, firstParam, worthForecasting } from "./trip-links.ts";

describe("dayHref", () => {
  test("today is the default, and the day is a query on the Trip tab", () => {
    assert.equal(dayHref("t1"), "/trips/t1/trip?day=today");
    assert.equal(dayHref("t1", 3), "/trips/t1/trip?day=3");
  });

  test("what the editor starts with rides along, encoded", () => {
    assert.equal(
      dayHref("t1", "2", { add: true, q: "Café Leila" }),
      "/trips/t1/trip?day=2&add=1&q=Caf%C3%A9+Leila",
    );
  });

  test("nothing extra, nothing added", () => {
    assert.equal(
      dayHref("t1", 1, { add: false, q: "" }),
      "/trips/t1/trip?day=1",
    );
  });
});

test("firstParam takes the first of a repeated parameter", () => {
  assert.equal(firstParam(["a", "b"]), "a");
  assert.equal(firstParam("a"), "a");
  assert.equal(firstParam(undefined), undefined);
});

describe("worthForecasting", () => {
  test("today and the next week, not before or after", () => {
    assert.equal(worthForecasting("2030-05-01", "2030-05-01"), true);
    assert.equal(worthForecasting("2030-05-08", "2030-05-01"), true);
    assert.equal(worthForecasting("2030-05-09", "2030-05-01"), false);
    assert.equal(worthForecasting("2030-04-30", "2030-05-01"), false);
  });
});
