import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, test } from "node:test";
import { sourceFiles } from "../scripts/test-support/imports.ts";

// Two Mapbox tokens, two jobs. The Directions token is a server secret:
// nothing that ships to a browser may name it, and no NEXT_PUBLIC_ variable may
// carry it, because Next inlines those into the client bundle. The browser's
// token is public by design and is restricted to this app's URLs in Mapbox.
// (The built output is checked separately in docs/mapbox.md.)

const SRC = resolve(import.meta.dirname);
const files = sourceFiles(SRC, { extensions: [".ts", ".tsx"] }).filter(
  (f) => !f.endsWith("mapbox-keys.test.ts"),
);

/** Where the server token may be named: code that runs only on the server. */
const SERVER_ONLY = /^(bll|infra|server|lib\/env\.ts)/;

describe("the Directions token", () => {
  test("is named only by server-side code", () => {
    const leaks = files
      .map((f) => relative(SRC, f))
      .filter((f) => !SERVER_ONLY.test(f))
      .filter((f) =>
        readFileSync(resolve(SRC, f), "utf8").includes(
          "MAPBOX_DIRECTIONS_TOKEN",
        ),
      );
    assert.deepEqual(leaks, []);
  });

  test("is never given a NEXT_PUBLIC_ name", () => {
    const named = files.filter((f) =>
      /NEXT_PUBLIC_\w*(DIRECTIONS|SECRET|SK)\w*/.test(readFileSync(f, "utf8")),
    );
    assert.deepEqual(named, []);
  });
});

describe("the browser's Mapbox variables", () => {
  test("are the only NEXT_PUBLIC_MAPBOX names, and none is a secret", () => {
    const names = new Set<string>();
    for (const f of files) {
      for (const m of readFileSync(f, "utf8").matchAll(
        /NEXT_PUBLIC_MAPBOX\w*/g,
      )) {
        names.add(m[0]);
      }
    }
    assert.deepEqual([...names].sort(), [
      "NEXT_PUBLIC_MAPBOX_STYLE_DARK",
      "NEXT_PUBLIC_MAPBOX_STYLE_LIGHT",
      "NEXT_PUBLIC_MAPBOX_STYLE_TERRAIN",
      "NEXT_PUBLIC_MAPBOX_TOKEN",
    ]);
  });

  test("the schema refuses a browser token that is not a public one", () => {
    const env = readFileSync(resolve(SRC, "lib/env.ts"), "utf8");
    assert.match(
      env,
      /NEXT_PUBLIC_MAPBOX_TOKEN[\s\S]{0,120}startsWith\("pk\."\)/,
    );
  });

  test("the route handler builds its provider from the server token, not the browser's", () => {
    const route = readFileSync(resolve(SRC, "server/routes/route.ts"), "utf8");
    assert.match(route, /token: env\.MAPBOX_DIRECTIONS_TOKEN/);
    assert.doesNotMatch(route, /NEXT_PUBLIC/);
  });
});
