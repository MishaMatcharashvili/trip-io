import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import ts from "typescript";

// What a source file imports, for the tests that police the repo's import
// rules: src/layers.test.ts (the dependency rule) and
// src/mobile-boundary.test.ts (the Expo app may take types, never code).
//
// It parses rather than pattern-matching. A regex misses an import whose
// specifier list has an apostrophe in a comment, and cannot tell a type query
// — `typeof import("x")`, erased at compile time — from a dynamic import that
// runs. The parser knows both.

export type ImportRef = {
  specifier: string;
  /** Erased at compile time: `import type`, `export type`, `typeof import()`. */
  typeOnly: boolean;
};

const kinds: Record<string, ts.ScriptKind> = {
  ".ts": ts.ScriptKind.TS,
  ".mts": ts.ScriptKind.TS,
  ".cts": ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js": ts.ScriptKind.JS,
  ".mjs": ts.ScriptKind.JS,
  ".cjs": ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
};

/** Every file extension the scanner can read. */
export const SCRIPT_EXTENSIONS = Object.keys(kinds);

export function importsIn(path: string): ImportRef[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    false,
    kinds[extname(path)] ?? ts.ScriptKind.TS,
  );
  const found: ImportRef[] = [];
  const add = (node: ts.Node | undefined, typeOnly: boolean) => {
    if (node && ts.isStringLiteralLike(node)) {
      found.push({ specifier: node.text, typeOnly });
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node)) {
      add(node.moduleSpecifier, node.importClause?.isTypeOnly ?? false);
    } else if (ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier, node.isTypeOnly);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      add(node.moduleReference.expression, node.isTypeOnly);
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument)) add(argument.literal, true);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const dynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const require = ts.isIdentifier(callee) && callee.text === "require";
      if (dynamicImport || require) add(node.arguments[0], false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Source files under `dir`, skipping the named directories. */
export function sourceFiles(
  dir: string,
  options: {
    extensions?: readonly string[];
    skipDirs?: ReadonlySet<string>;
    skipFile?: (name: string) => boolean;
  } = {},
): string[] {
  const {
    extensions = SCRIPT_EXTENSIONS,
    skipDirs = new Set(),
    skipFile = () => false,
  } = options;
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return skipDirs.has(entry.name)
        ? []
        : sourceFiles(path, { extensions, skipDirs, skipFile });
    }
    if (!extensions.includes(extname(entry.name))) return [];
    return skipFile(entry.name) ? [] : [path];
  });
}
