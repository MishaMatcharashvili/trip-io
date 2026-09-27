import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ownSite } from "./website.ts";

describe("ownSite", () => {
  test("a place's own site, as its origin", () => {
    assert.equal(
      ownSite("https://www.tsinandali.com/en/rooms?x=1")?.href,
      "https://www.tsinandali.com/",
    );
  });

  test("a bare host gets https", () => {
    assert.equal(ownSite("roomshotels.com")?.href, "https://roomshotels.com/");
  });

  test("platform pages are not the place's own", () => {
    for (const site of [
      "https://www.facebook.com/ciderclubbazaleti",
      "https://m.facebook.com/x",
      "https://www.booking.com/hotel/ge/x.html",
      "https://instagram.com/x",
      "https://x.business.site",
    ]) {
      assert.equal(ownSite(site), null, site);
    }
  });

  test("a host that only ends like a platform is still the place's", () => {
    assert.equal(
      ownSite("https://notfacebook.com")?.hostname,
      "notfacebook.com",
    );
  });

  test("nothing, junk, and other schemes are null", () => {
    for (const site of [
      null,
      undefined,
      "",
      "  ",
      "mailto:a@b.ge",
      "localhost",
      "ftp://x.ge",
    ]) {
      assert.equal(ownSite(site), null, String(site));
    }
  });
});
