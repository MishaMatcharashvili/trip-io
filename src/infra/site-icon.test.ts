import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { iconLinks, isPublicAddress } from "./site-icon.ts";

const base = new URL("https://hotel.ge/en/");

describe("iconLinks", () => {
  test("touch icons first, then icons by declared size", () => {
    const html = `
      <link rel="icon" href="/fav-16.png" sizes="16x16">
      <link rel="icon" type="image/png" href="/fav-96.png" sizes="96x96">
      <link rel='apple-touch-icon' href='/touch.png'>`;
    assert.deepEqual(
      iconLinks(html, base).map((u) => u.pathname),
      ["/touch.png", "/fav-96.png", "/fav-16.png"],
    );
  });

  test("relative hrefs resolve against the page", () => {
    const [url] = iconLinks(
      '<link rel="shortcut icon" href="img/i.ico">',
      base,
    );
    assert.equal(url.href, "https://hotel.ge/en/img/i.ico");
  });

  test("never an SVG, and not a stylesheet", () => {
    const html = `
      <link rel="icon" href="/logo.svg">
      <link rel="icon" type="image/svg+xml" href="/logo">
      <link rel="stylesheet" href="/site.css">`;
    assert.deepEqual(iconLinks(html, base), []);
  });
});

describe("isPublicAddress", () => {
  test("private, loopback, link-local and metadata addresses are not", () => {
    for (const a of [
      "10.0.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.5.4",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      assert.equal(isPublicAddress(a), false, a);
    }
  });

  test("public addresses are", () => {
    for (const a of ["93.184.216.34", "172.32.0.1", "2606:4700::1111"]) {
      assert.equal(isPublicAddress(a), true, a);
    }
  });

  test("a hostname is not an address", () => {
    assert.equal(isPublicAddress("localhost"), false);
  });
});
