import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveRegion } from "./gazetteer.ts";

const slugs = new Set([
  "tbilisi",
  "kazbegi",
  "signagi",
  "mestia",
  "oni",
  "ambrolauri",
  "akhaltsikhe",
  "aspindza",
  "kutaisi",
]);
const r = (p: string) => resolveRegion(p, slugs);

describe("resolveRegion", () => {
  test("a region by its own name, whatever the case or suffix", () => {
    assert.equal(r("Tbilisi"), "tbilisi");
    assert.equal(r("KUTAISI municipality"), "kutaisi");
  });

  test("a town or resort that sits inside a municipality", () => {
    assert.equal(r("Gudauri"), "kazbegi");
    assert.equal(r("Stepantsminda"), "kazbegi");
    assert.equal(r("Ushguli"), "mestia");
  });

  test("the spellings a translator produces", () => {
    assert.equal(r("Sighnaghi"), "signagi");
    assert.equal(r("Sighnaghi Municipality"), "signagi");
  });

  test("a place inside a longer description", () => {
    assert.equal(r("Rustaveli Avenue, Tbilisi"), "tbilisi");
    assert.equal(r("the Darial Gorge"), "kazbegi");
  });

  test("a journey is not a place", () => {
    assert.equal(r("Tbilisi to Kazbegi"), null);
  });

  test("a name two regions share is refused, not chosen between", () => {
    assert.equal(r("Racha"), null);
    assert.equal(r("Vardzia"), null);
  });

  test("a region with no live trips cannot be pinned, and neither can nonsense", () => {
    assert.equal(r("Batumi"), null);
    assert.equal(r("Narnia"), null);
    assert.equal(r(""), null);
  });

  test("words that merely contain a name do not match", () => {
    assert.equal(r("Snowdonia"), null);
    assert.equal(r("Onibus depot"), null);
  });
});
