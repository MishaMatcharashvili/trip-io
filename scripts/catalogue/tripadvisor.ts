import { parseArgs } from "node:util";
import {
  liveListingDeps,
  readListing,
} from "../../src/bll/tripadvisor-listings.ts";
import { listedDestinations } from "../../src/dal/listings.ts";
import {
  destination,
  destinationSlugs,
} from "../../src/domain/catalogue/destinations.ts";
import {
  type ListingQuery,
  listingQueries,
} from "../../src/domain/catalogue/listings.ts";
import { env } from "../../src/lib/env.ts";

// Reads Tripadvisor's lists of restaurants and things to do for destinations
// into tripadvisor_listing, through Apify (docs/tripadvisor-lists.md), waiting
// for each read to finish. Trips fill these by themselves, a destination at a
// time, and the queue reads them again monthly; this is for a first fill, or a
// look at one place.
//
//   pnpm catalogue:tripadvisor -- --destination tbilisi
//   pnpm catalogue:tripadvisor -- --destination tbilisi --kind restaurant --max 20
//   pnpm catalogue:tripadvisor -- --listed        every destination already read
//
// Apify charges per place read: $0.005 each on its free plan. A destination's
// two lists are up to 230 places, about $1.15.

const { values: args } = parseArgs({
  options: {
    destination: { type: "string", multiple: true },
    listed: { type: "boolean", default: false },
    kind: { type: "string" },
    max: { type: "string" },
  },
});

if (!env.APIFY_TOKEN) {
  console.error("APIFY_TOKEN is not set: nothing to read with.");
  process.exit(2);
}
const slugs = args.listed
  ? await listedDestinations()
  : (args.destination ?? []);
if (slugs.length === 0) {
  console.error(
    "Name a --destination (one of the slugs in destinations.ts) or pass --listed.",
  );
  process.exit(2);
}
const unknown = slugs.filter((s) => !destination(s));
if (unknown.length > 0) {
  console.error(
    `No destination ${unknown.join(", ")}. Some: ${destinationSlugs.slice(0, 12).join(", ")}…`,
  );
  process.exit(2);
}

const queries: ListingQuery[] = slugs
  .flatMap((s) =>
    listingQueries(
      destination(s) as NonNullable<ReturnType<typeof destination>>,
    ),
  )
  .filter((q) => !args.kind || q.kind === args.kind)
  .map((q) => (args.max ? { ...q, max: Number(args.max) } : q));

const deps = {
  ...liveListingDeps(),
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

// A few at once: each is a run on Apify, and runs share the account's memory.
const AT_ONCE = 3;
let failed = 0;
let read = 0;
const pending = [...queries];
await Promise.all(
  Array.from({ length: AT_ONCE }, async () => {
    for (let q = pending.shift(); q; q = pending.shift()) {
      const outcome = await readListing(q, deps);
      const label = `${q.name} ${q.kind}s (up to ${q.max})`;
      if (outcome.state === "saved") {
        read += outcome.listings;
        console.log(`  ✔ ${label}: ${outcome.listings} kept`);
      } else {
        failed++;
        console.log(
          `  ✘ ${label}: ${outcome.state === "failed" ? outcome.reason : outcome.state}`,
        );
      }
    }
  }),
);

console.log(
  `\n${read} places kept from ${queries.length - failed} of ${queries.length} lists.`,
);
process.exit(failed ? 1 : 0);
