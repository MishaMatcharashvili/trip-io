import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, test } from "node:test";

// The Expo app mirrors Mist's base colours (mobile/src/theme.ts), because React
// Native cannot read the CSS variables in globals.css. This keeps the copy
// honest: change a token on one side only and this fails.

const ROOT = resolve(import.meta.dirname, "..");
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
const mobile = readFileSync(join(ROOT, "mobile/src/theme.ts"), "utf8");

/** `--color-<token>` in the light block (the first) and the dark block. */
function cssToken(token: string): { light: string; dark: string } {
  const values = [
    ...css.matchAll(new RegExp(`--color-${token}:\\s*(#[0-9a-f]{6})`, "gi")),
  ].map((m) => m[1].toLowerCase());
  assert.equal(values.length, 2, `--color-${token} in both themes`);
  return { light: values[0], dark: values[1] };
}

/** `<key>: "#......"` inside `const <theme> ... = { ... }` in theme.ts. */
function mobileColour(theme: "light" | "dark", key: string): string {
  const block = mobile.match(
    new RegExp(`const ${theme}\\b[^=]*=\\s*\\{([^}]*)\\}`),
  )?.[1];
  assert.ok(block, `a ${theme} palette in mobile/src/theme.ts`);
  const value = block.match(
    new RegExp(`\\b${key}:\\s*"(#[0-9a-f]{6})"`, "i"),
  )?.[1];
  assert.ok(value, `${theme}.${key} in mobile/src/theme.ts`);
  return value.toLowerCase();
}

describe("mobile palette", () => {
  for (const [key, token] of [
    ["canvas", "canvas"],
    ["ink", "ink"],
  ] as const) {
    test(`${key} matches --color-${token} in both themes`, () => {
      const web = cssToken(token);
      assert.equal(mobileColour("light", key), web.light);
      assert.equal(mobileColour("dark", key), web.dark);
    });
  }
});
