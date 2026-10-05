import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { isAllowedImage } from "./image-hosts.ts";

describe("isAllowedImage", () => {
  test("the Wikimedia thumbnail the API returns today", () => {
    assert.ok(
      isAllowedImage(
        "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/5c/Mosaic_in_Mtatsminda_Pantheon_in_Tbilisi.jpg/960px-Mosaic_in_Mtatsminda_Pantheon_in_Tbilisi.jpg?utm_source=commons.wikimedia.org",
      ),
    );
  });

  test("the older upload host, Tripadvisor and Google", () => {
    assert.ok(
      isAllowedImage(
        "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/960px-X.jpg",
      ),
    );
    assert.ok(
      isAllowedImage("https://dynamic-media.tacdn.com/media/photo-o/1/2/3.jpg"),
    );
    assert.ok(isAllowedImage("https://lh3.googleusercontent.com/p/abc"));
  });

  test("anything else, over any scheme, is not", () => {
    assert.ok(!isAllowedImage("https://example.com/a.jpg"));
    assert.ok(
      !isAllowedImage("http://thumb.wikimedia.org/wikipedia/commons/x.jpg"),
    );
    assert.ok(!isAllowedImage("https://thumb.wikimedia.org/other/x.jpg"));
    assert.ok(!isAllowedImage("not a url"));
  });
});
