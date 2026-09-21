import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, test } from "node:test";

// The dependency rule, as a test rather than a paragraph in a document.
//
//   domain ← dal ← bll ← server ← app
//
// `src/trigger` sits beside `src/server`: both are entry points that call use
// cases, one over HTTP and one on a schedule.
//
// Each layer may use the ones to its left and must not know the ones to its
// right. The domain knows nothing at all: it is plain functions over plain
// values, which is what makes it testable without a database or a model.
//
// When this fails, the fix is almost never to add an exception. It is to ask
// which layer the code belongs in — the answer is usually "one further left".

const SRC = resolve(import.meta.dirname);

type Layer =
  | "domain"
  | "dal"
  | "bll"
  | "infra"
  | "server"
  | "app"
  | "lib"
  | "trigger";

/** What each layer is allowed to import. */
const mayImport: Record<Layer, readonly Layer[]> = {
  domain: [],
  dal: ["domain"],
  bll: ["domain", "dal", "infra"],
  infra: ["domain", "dal"],
  server: ["domain", "bll", "infra", "lib"],
  app: ["domain", "bll", "server", "infra", "lib"],
  lib: ["domain", "server"],
  // Trigger.dev tasks are an entry point, like a route handler: the scheduler
  // calls in from outside. Same rights as `server` — it may call a use case,
  // never a repository — which is what keeps the option of running the
  // pipeline there open without the tasks growing their own data access.
  trigger: ["domain", "bll", "infra", "lib"],
};

const layerOf = (path: string): Layer | null => {
  const [first] = relative(SRC, path).split("/");
  switch (first) {
    case "domain":
    case "dal":
    case "bll":
    case "infra":
    case "server":
    case "lib":
    case "trigger":
      return first;
    case "app":
    case "ui":
    case "features":
    case "data":
      return "app";
    default:
      return null;
  }
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "migrations" ? [] : sourceFiles(path);
    }
    if (![".ts", ".tsx"].includes(extname(entry.name))) return [];
    return entry.name.endsWith(".test.ts") ? [] : [path];
  });
}

const importPattern = /(?:from|import)\s*["']([^"']+)["']/g;

/** Every module a file imports, as a path relative to src, or a package name. */
function importsOf(path: string): string[] {
  const body = readFileSync(path, "utf8");
  return [...body.matchAll(importPattern)].map(([, specifier]) => {
    if (specifier.startsWith("@/")) return specifier.slice(2);
    if (!specifier.startsWith(".")) return specifier;
    return relative(SRC, resolve(path, "..", specifier));
  });
}

const files = sourceFiles(SRC);

describe("layers", () => {
  test("the source tree is laid out in the layers we think it is", () => {
    const stray = files.filter((f) => layerOf(f) === null);
    assert.deepEqual(
      stray.map((f) => relative(SRC, f)),
      [],
      "every file under src belongs to a layer",
    );
    assert.ok(files.length > 50, "found the source tree");
  });

  test("no layer imports one to its right", () => {
    const broken: string[] = [];
    for (const file of files) {
      const from = layerOf(file);
      if (!from) continue;
      for (const specifier of importsOf(file)) {
        const to = layerOf(resolve(SRC, specifier));
        if (!to || to === from) continue;
        if (!mayImport[from].includes(to)) {
          broken.push(
            `${relative(SRC, file)} → ${specifier} (${from} → ${to})`,
          );
        }
      }
    }
    assert.deepEqual(broken, []);
  });

  test("only the data layer speaks SQL", () => {
    // `src/infra/auth.ts` is the one exception: Better Auth's Drizzle adapter is
    // configured with the connection, but issues no query of ours.
    const allowed = ["dal/", "infra/auth.ts"];
    const offenders = files.filter((file) => {
      const path = relative(SRC, file);
      if (allowed.some((prefix) => path.startsWith(prefix))) return false;
      return importsOf(file).some(
        (s) => s.startsWith("drizzle-orm") || s.startsWith("dal/client"),
      );
    });
    assert.deepEqual(
      offenders.map((f) => relative(SRC, f)),
      [],
    );
  });

  test("the domain imports no runtime dependency but zod", () => {
    const allowed = new Set(["zod", "node:crypto"]);
    const offenders: string[] = [];
    for (const file of files.filter((f) => layerOf(f) === "domain")) {
      for (const specifier of importsOf(file)) {
        const external =
          !specifier.startsWith(".") && !specifier.startsWith("/");
        const local = layerOf(resolve(SRC, specifier)) !== null;
        if (external && !local && !allowed.has(specifier)) {
          offenders.push(`${relative(SRC, file)} → ${specifier}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
