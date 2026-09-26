import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { importsIn } from "./imports.ts";

const dir = mkdtempSync(join(tmpdir(), "imports-"));
const scan = (name: string, body: string) => {
  const path = join(dir, name);
  writeFileSync(path, body);
  return importsIn(path);
};

describe("importsIn", () => {
  test("tells type-only imports from value imports", () => {
    assert.deepEqual(
      scan(
        "a.ts",
        `import type { A } from "@/types";
import { b } from "@/values";
export type { C } from "@/more-types";
export { d } from "@/more-values";
import "@/side-effect";`,
      ),
      [
        { specifier: "@/types", typeOnly: true },
        { specifier: "@/values", typeOnly: false },
        { specifier: "@/more-types", typeOnly: true },
        { specifier: "@/more-values", typeOnly: false },
        { specifier: "@/side-effect", typeOnly: false },
      ],
    );
  });

  test("sees an import whose specifier list has an apostrophe in a comment", () => {
    assert.deepEqual(
      scan(
        "b.ts",
        `import {
  getTrip, // don't inline
} from "@/bll/trips";`,
      ),
      [{ specifier: "@/bll/trips", typeOnly: false }],
    );
  });

  test("a type query is type-only; a dynamic import or require runs", () => {
    assert.deepEqual(
      scan(
        "c.ts",
        `type App = typeof import("@/server/app");
const lazy = () => import("@/dal/client");
const old = require("@/infra/auth");`,
      ),
      [
        { specifier: "@/server/app", typeOnly: true },
        { specifier: "@/dal/client", typeOnly: false },
        { specifier: "@/infra/auth", typeOnly: false },
      ],
    );
  });

  test("reads JavaScript and JSX too", () => {
    assert.deepEqual(
      scan(
        "d.jsx",
        `import { db } from "@/dal/client";\nexport const X = () => <div />;`,
      ),
      [{ specifier: "@/dal/client", typeOnly: false }],
    );
    assert.deepEqual(scan("e.cjs", `const { db } = require("@/dal/client");`), [
      { specifier: "@/dal/client", typeOnly: false },
    ]);
  });
});
