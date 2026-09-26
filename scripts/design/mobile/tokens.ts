import { readFileSync } from "node:fs";

/**
 * The Mist tokens, read out of the web app's stylesheet rather than copied, so
 * the design bundle cannot drift from what the app ships. Light values come
 * from the `@theme` block and dark from `:root[data-theme="dark"]`; the bundle
 * scopes them to `[data-theme]` so one page can hold a light and a dark frame
 * side by side.
 */

const GLOBALS = new URL("../../../src/app/globals.css", import.meta.url);

/** The token families a static screen needs — not fonts or animations. */
const FAMILIES = ["--color-", "--text-", "--radius-", "--shadow-"];

/** The body of the block that opens at `opener`, braces balanced. */
function block(css: string, opener: string): string {
  const start = css.indexOf(opener);
  if (start === -1) throw new Error(`globals.css has no "${opener}" block`);
  let depth = 0;
  for (let i = start + opener.length - 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) {
      return css.slice(start + opener.length, i);
    }
  }
  throw new Error(`"${opener}" block in globals.css is never closed`);
}

/** Top-level custom properties only: nested blocks (keyframes) are dropped. */
function declarations(body: string): string[] {
  let flat = "";
  let depth = 0;
  for (const ch of body) {
    if (ch === "{") depth++;
    if (depth === 0) flat += ch;
    if (ch === "}") depth--;
  }
  return [...flat.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
    .filter(([, name]) => FAMILIES.some((f) => name.startsWith(f)))
    .map(([, name, value]) => `${name}:${value.replace(/\s+/g, " ").trim()}`);
}

export function tokensCss(): string {
  const css = readFileSync(GLOBALS, "utf8");
  const light = declarations(block(css, "@theme {"));
  const dark = declarations(block(css, ':root[data-theme="dark"] {'));
  if (light.length === 0 || dark.length === 0) {
    throw new Error("globals.css tokens could not be read");
  }
  return [
    `:root,[data-theme="light"]{color-scheme:light;${light.join(";")}}`,
    `[data-theme="dark"]{color-scheme:dark;${dark.join(";")}}`,
  ].join("\n");
}
