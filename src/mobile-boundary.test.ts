import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, test } from "node:test";

// The Expo app in mobile/ may know this package's types, never its code.
//
// It reads AppType so its API client is typed end to end. A plain import in
// place of `import type` would make Metro bundle the server into the phone
// app: Drizzle, the database driver, provider keys read from process.env.
// Babel erases an `import type` statement whole, so that is the only form
// allowed to cross.

const ROOT = resolve(import.meta.dirname, "..");
const MOBILE = join(ROOT, "mobile");
const SKIP = new Set(["node_modules", ".expo", "ios", "android", "dist"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return SKIP.has(entry.name) ? [] : sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

// Static imports and re-exports, whole statements so `import type` is visible,
// plus side-effect imports, dynamic imports and require calls.
const statementPattern =
  /\b(import|export)\s+(type\s+)?(?:[^;"']*?\sfrom\s*)?["']([^"']+)["']/g;
const callPattern = /\b(?:import|require)\s*\(\s*["']([^"']+)["']/g;

/** Whether a specifier written in `file` leaves the mobile package. */
function crosses(file: string, specifier: string): boolean {
  if (specifier.startsWith("@/")) return true;
  if (!specifier.startsWith(".")) return false;
  return relative(MOBILE, resolve(file, "..", specifier)).startsWith("..");
}

type Crossing = { file: string; specifier: string; typeOnly: boolean };

function crossingsOf(file: string): Crossing[] {
  const body = readFileSync(file, "utf8");
  const at = relative(ROOT, file);
  const statements = [...body.matchAll(statementPattern)].map(
    ([, , type, specifier]) => ({ specifier, typeOnly: Boolean(type) }),
  );
  const calls = [...body.matchAll(callPattern)].map(([, specifier]) => ({
    specifier,
    typeOnly: false,
  }));
  return [...statements, ...calls]
    .filter(({ specifier }) => crosses(file, specifier))
    .map((c) => ({ file: at, ...c }));
}

const crossings = sourceFiles(MOBILE).flatMap(crossingsOf);

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
