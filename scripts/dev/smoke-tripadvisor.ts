// Exercises the Tripadvisor Terra adapter against the LIVE API: finds four
// well-known Georgian places by name, decides which result is each (the same
// chooseMatch the app uses), and reads their rating, reviews and photos. Run with `pnpm smoke:tripadvisor`. Needs TRIPADVISOR_API_KEY in .env;
// it touches no database.
//
// What it costs: a search returns up to five locations and a read about three,
// every one a billable entity — roughly 20 for the run, against the Discover
// tier's 1,000 free. There is no allowlist step: a Discover key reads any place,
// which was checked live, and the allowlist endpoint's own rate limit answers
// 429 to a single append.
//
// The unit tests in src/infra/tripadvisor.test.ts use replies shaped from
// Terra's reference. This is the only check that Terra answers in those
// shapes, and that a place is found where the catalogue says it is. A shape
// that does not fit shows as `malformed`; the first thing to do then is read
// the raw reply and fix the adapter's parser, not loosen it.
//
// Review text is counted, never printed: it is somebody's writing and is not
// to land in a terminal log or a CI artifact.

import {
  chooseMatch,
  type PlaceIdentity,
} from "../../src/domain/catalogue/enrichment.ts";
import { tripadvisor } from "../../src/infra/tripadvisor.ts";

const key = process.env.TRIPADVISOR_API_KEY;
if (!key) {
  console.error("TRIPADVISOR_API_KEY is not set: nothing to check.");
  process.exit(2);
}

const provider = tripadvisor({ key });
let failures = 0;
const expect = (ok: boolean, what: string) => {
  console.log(`${ok ? "  ✔" : "  ✘"} ${what}`);
  if (!ok) failures++;
};

const places: PlaceIdentity[] = [
  {
    name: "Narikala Fortress",
    nameKa: "ნარიყალა",
    lonLat: [44.8103, 41.6875],
    category: "castle",
  },
  {
    name: "Gergeti Trinity Church",
    nameKa: "გერგეტის სამება",
    lonLat: [44.6206, 42.6638],
    category: "christian_place_of_worship",
  },
  {
    name: "Fabrika",
    nameKa: "ფაბრიკა",
    lonLat: [44.8028, 41.7095],
    category: "hotel",
  },
  {
    name: "Georgian National Museum",
    nameKa: null,
    lonLat: [44.8002, 41.6959],
    category: "museum",
  },
];

for (const place of places) {
  console.log(`\n── ${place.name}`);

  const found = await provider.search(place);
  expect(found.ok, `search answered${found.ok ? "" : ` (${found.reason})`}`);
  if (!found.ok) continue;
  console.log(
    `   ${found.candidates.length} candidates: ${found.candidates
      .map((c) => `${c.id} ${c.names[0] ?? "?"}`)
      .join("; ")}`,
  );
  expect(
    found.candidates.every((c) => c.lonLat !== null),
    "every candidate has coordinates (the match depends on them)",
  );

  const match = chooseMatch(place, found.candidates);
  expect(match !== null, "one candidate is this place");
  if (!match) continue;
  console.log(`   matched ${match.id} at ${match.confidence.toFixed(2)}`);

  const read = await provider.read(match.id);
  expect(read.ok, `read${read.ok ? "" : ` (${read.reason})`}`);
  if (!read.ok) continue;

  const e = read.enrichment;
  console.log(
    `   rating ${e.rating ? `${e.rating.value} of ${e.rating.count}` : "none"}, ` +
      `${e.reviews.length} reviews, ${e.photos.length} photos, ranking ${e.ranking ?? "none"}`,
  );
  expect(e.url.startsWith("https://"), "it links back to its own page");
  expect(
    e.rating === null || (e.rating.value >= 1 && e.rating.value <= 5),
    "the rating is between one and five",
  );
  expect(
    e.reviews.every((r) => r.rating >= 1 && r.rating <= 5 && r.text.length > 0),
    "every review has a rating and some text",
  );
  expect(
    e.photos.every((p) => p.url.startsWith("https://")),
    "every photo is served over https",
  );
}

console.log(
  failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.",
);
process.exit(failures ? 1 : 0);
