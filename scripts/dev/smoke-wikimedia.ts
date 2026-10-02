// Exercises the Wikimedia Commons photo source against the LIVE API: real places
// in Georgia, asking what it would show for each. Run with `pnpm smoke:wikimedia`.
// Needs no key and touches no database; it makes two requests per place.
//
// What it checks is the thing the unit tests cannot: that Commons answers in the
// shape the adapter reads, and that what survives the filter is a photograph OF
// the place and not of its neighbour. A landmark should come back with photos; a
// hotel nobody has photographed by name should come back with none, which is the
// right answer. The titles are printed so that can be judged by eye.

import type { PlaceIdentity } from "../../src/domain/catalogue/enrichment.ts";
import { wikimediaPhotos } from "../../src/infra/wikimedia.ts";

const places: (PlaceIdentity & { expect: "some" | "any" })[] = [
  {
    name: "Narikala Fortress",
    nameKa: "ნარიყალა",
    lonLat: [44.8103, 41.6875],
    category: "castle",
    expect: "some",
  },
  {
    name: "Gergeti Trinity Church",
    nameKa: "გერგეტის სამება",
    lonLat: [44.6206, 42.6638],
    category: "christian_place_of_worship",
    expect: "some",
  },
  {
    name: "Svetitskhoveli Cathedral",
    nameKa: null,
    lonLat: [44.7213, 41.8426],
    category: "christian_place_of_worship",
    expect: "some",
  },
  {
    name: "Hilton Garden Inn Tbilisi Chavchavadze",
    nameKa: null,
    lonLat: [44.7677, 41.7167],
    category: "hotel",
    expect: "any",
  },
];

const source = wikimediaPhotos();
let failures = 0;
const expectIt = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${what}`);
  if (!ok) failures++;
};

for (const place of places) {
  console.log(`\n── ${place.name}`);
  const out = await source.find(place);
  expectIt(out.ok, `answered${out.ok ? "" : ` (${out.reason})`}`);
  if (!out.ok) continue;
  console.log(`   ${out.photos.length} photos`);
  for (const p of out.photos.slice(0, 5)) {
    console.log(`   · ${p.caption ?? "(no caption)"} — ${p.credit?.text}`);
  }
  if (place.expect === "some") {
    expectIt(out.photos.length > 0, "a landmark has photographs");
  }
  expectIt(
    out.photos.every(
      (p) =>
        p.url.startsWith("https://") && p.credit?.url.startsWith("https://"),
    ),
    "every photo is https and carries its credit",
  );
}

console.log(
  failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.",
);
process.exit(failures ? 1 : 0);
