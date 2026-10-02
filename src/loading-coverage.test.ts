import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";

// A screen with no loading state of its own is shown the nearest one above it,
// and above the trip's screens that is the generic page skeleton, which has
// nothing in common with them: it draws another bar and another layout, and the
// screen then arrives looking like something else. That was the bug. So every
// screen under a trip must have a loading.tsx at its own level or inside the
// trip, never reaching past it.

const APP = resolve(import.meta.dirname, "app");
const TRIPS = join(APP, "trips", "[tripId]");

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

/** The loading.tsx that covers a page, if one sits between it and the trip's root. */
function covering(page: string): string | null {
  for (let dir = dirname(page); dir.startsWith(TRIPS); dir = dirname(dir)) {
    const loading = join(dir, "loading.tsx");
    if (existsSync(loading)) return loading;
  }
  return null;
}

test("every screen of a trip has a loading state inside the trip", () => {
  const uncovered = pages(TRIPS)
    .filter((page) => covering(page) === null)
    .map((page) => relative(APP, page));
  assert.deepEqual(uncovered, []);
});

// The same for the site's own pages, and stricter: a page that inherits the
// loading state of a page above it is shown that page's layout, which is what
// happened to every page without one under the root's. Each has its own. The
// design reference is static and never loads.
const EXEMPT = new Set(["design/page.tsx"]);

test("every other page has a loading state of its own", () => {
  const uncovered = pages(APP)
    .map((page) => relative(APP, page))
    .filter((page) => !page.startsWith("trips/") && !page.startsWith("api/"))
    .filter((page) => !EXEMPT.has(page))
    .filter((page) => !existsSync(join(APP, dirname(page), "loading.tsx")));
  assert.deepEqual(uncovered, []);
});
