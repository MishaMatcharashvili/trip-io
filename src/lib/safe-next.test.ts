import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { safeNext } from "./safe-next.ts";

// `?next=` is read from the address bar and handed to the router after
// sign-in, which makes it the classic open redirect: a link to our own sign-in
// page that ends on someone else's.

describe("safeNext", () => {
  test("keeps a path on this site, query and fragment included", () => {
    assert.equal(safeNext("/account"), "/account");
    assert.equal(
      safeNext("/trips/abc/briefing?x=1#top"),
      "/trips/abc/briefing?x=1#top",
    );
  });

  test("falls back home when there is nothing usable", () => {
    assert.equal(safeNext(undefined), "/");
    assert.equal(safeNext(""), "/");
    assert.equal(safeNext("account"), "/");
    assert.equal(safeNext("https://evil.example"), "/");
  });

  test("refuses every spelling of another origin", () => {
    for (const next of [
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
    ]) {
      assert.equal(safeNext(next), "/", JSON.stringify(next));
    }
  });
});
