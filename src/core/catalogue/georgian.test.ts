import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { romanise, splitName } from "./georgian.ts";

describe("romanise", () => {
  test("matches road-sign spellings", () => {
    assert.equal(romanise("თბილისი"), "Tbilisi");
    assert.equal(romanise("ქუთაისი"), "Kutaisi");
    assert.equal(romanise("მცხეთა"), "Mtskheta");
    assert.equal(romanise("წყალტუბო"), "Tsqaltubo");
    assert.equal(romanise("ყაზბეგი"), "Qazbegi");
  });

  test("capitalises each word and keeps punctuation and digits", () => {
    assert.equal(romanise("ძველი თბილისი 2"), "Dzveli Tbilisi 2");
    assert.equal(romanise("ბარ-რესტორანი"), "Bar-Restorani");
  });
});

describe("splitName", () => {
  test("Latin-only names pass through", () => {
    assert.deepEqual(splitName("Fabrika"), { name: "Fabrika", nameKa: null });
  });

  test("prefers the Latin half of a bilingual name", () => {
    assert.deepEqual(
      splitName("Villa Digomi Residence • ვილა დიღომი რეზიდენსი"),
      {
        name: "Villa Digomi Residence",
        nameKa: "ვილა დიღომი რეზიდენსი",
      },
    );
    assert.deepEqual(splitName("ბოსტოღანა · Bostogana"), {
      name: "Bostogana",
      nameKa: "ბოსტოღანა",
    });
  });

  test("romanises Georgian-only names", () => {
    assert.deepEqual(splitName("სკანდის ციხე"), {
      name: "Skandis Tsikhe",
      nameKa: "სკანდის ციხე",
    });
  });
});
