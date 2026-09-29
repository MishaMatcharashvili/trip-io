import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, test } from "node:test";
import { sourceFiles } from "../scripts/test-support/imports.ts";

// The Routes key is a server secret. Nothing that ships to a browser may name
// it, and no NEXT_PUBLIC_ variable may carry it: Next inlines those into the
// client bundle. (The built output is checked separately in docs/google-maps.md.)

const SRC = resolve(import.meta.dirname);
const files = sourceFiles(SRC, { extensions: [".ts", ".tsx"] });

/** Where the server key may be named: code that runs only on the server. */
const SERVER_ONLY = /^(bll|infra|server|lib\/env\.ts|google-keys\.test\.ts)/;

describe("the Routes API key", () => {
  test("is named only by server-side code", () => {
    const leaks = files
      .map((f) => relative(SRC, f))
      .filter((f) => !SERVER_ONLY.test(f))
      .filter((f) =>
        readFileSync(resolve(SRC, f), "utf8").includes(
          "GOOGLE_MAPS_ROUTES_API_KEY",
        ),
      );
    assert.deepEqual(leaks, []);
  });

  test("is never given a NEXT_PUBLIC_ name", () => {
    const named = files.filter((f) =>
      /NEXT_PUBLIC_\w*ROUTES\w*KEY/.test(readFileSync(f, "utf8")),
    );
    assert.deepEqual(
      named.filter((f) => !f.endsWith("google-keys.test.ts")),
      [],
    );
  });

  test("the browser key is the only Google key with a NEXT_PUBLIC_ name", () => {
    const names = new Set<string>();
    for (const f of files.filter((f) => !f.endsWith("google-keys.test.ts"))) {
      for (const m of readFileSync(f, "utf8").matchAll(
        /NEXT_PUBLIC_GOOGLE\w*/g,
      )) {
        names.add(m[0]);
      }
    }
    assert.deepEqual([...names].sort(), [
      "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
      "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID",
    ]);
  });
});
