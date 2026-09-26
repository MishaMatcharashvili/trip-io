import assert from "node:assert/strict";
import { join, relative, resolve } from "node:path";
import { describe, test } from "node:test";
import { importsIn, sourceFiles } from "../scripts/test-support/imports.ts";

// The Expo app in mobile/ may know this package's types, never its code.
//
// It reads AppType so its API client is typed end to end. A plain import in
// place of `import type` would make Metro bundle the server into the phone
// app: Drizzle, the database driver, provider keys read from process.env.
// Babel erases an `import type` statement whole, so that is the only form
// allowed to cross (with `export type`, and `typeof import()` in a type).
// Every script Metro would bundle is read — .js, .jsx, .mjs and .cjs as well.

const ROOT = resolve(import.meta.dirname, "..");
const MOBILE = join(ROOT, "mobile");
const SKIP = new Set(["node_modules", ".expo", "ios", "android", "dist"]);

/** Whether a specifier written in `file` leaves the mobile package. */
function crosses(file: string, specifier: string): boolean {
  if (specifier.startsWith("@/")) return true;
  if (!specifier.startsWith(".")) return false;
  return relative(MOBILE, resolve(file, "..", specifier)).startsWith("..");
}

type Crossing = { file: string; specifier: string; typeOnly: boolean };

function crossingsOf(file: string): Crossing[] {
  const at = relative(ROOT, file);
  return importsIn(file)
    .filter(({ specifier }) => crosses(file, specifier))
    .map((c) => ({ file: at, ...c }));
}

const crossings = sourceFiles(MOBILE, { skipDirs: SKIP }).flatMap(crossingsOf);

describe("mobile boundary", () => {
  test("finds the app's typed client reaching for AppType", () => {
    assert.ok(
      crossings.some(
        (c) => c.file === "mobile/src/api.ts" && c.specifier === "@/server/app",
      ),
      "the scan sees mobile/src/api.ts importing @/server/app",
    );
  });

  test("the app imports this package's types only", () => {
    const offenders = crossings
      .filter((c) => !c.typeOnly)
      .map((c) => `${c.file} → ${c.specifier}`);
    assert.deepEqual(offenders, []);
  });
});
