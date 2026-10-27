import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ADMIN_SESSION_SECONDS,
  type AdminConfig,
  checkCredentials,
  issueToken,
  safeNext,
  verifyToken,
} from "./admin-session.ts";

const config: AdminConfig = {
  username: "operator",
  password: "correct horse battery",
  secret: "x".repeat(32),
};
const NOW = new Date("2026-10-07T12:00:00Z");

describe("checkCredentials", () => {
  test("accepts the pair, and only the pair", () => {
    assert.ok(checkCredentials(config, "operator", "correct horse battery"));
    assert.ok(!checkCredentials(config, "operator", "wrong"));
    assert.ok(!checkCredentials(config, "Operator", "correct horse battery"));
    assert.ok(!checkCredentials(config, "", ""));
  });
});

describe("tokens", () => {
  test("a fresh token verifies until it expires", () => {
    const token = issueToken(config, NOW);
    assert.ok(verifyToken(config, token, NOW));
    const nearly = new Date(+NOW + (ADMIN_SESSION_SECONDS - 1) * 1000);
    assert.ok(verifyToken(config, token, nearly));
    const after = new Date(+NOW + (ADMIN_SESSION_SECONDS + 1) * 1000);
    assert.ok(!verifyToken(config, token, after));
  });

  test("an altered expiry is refused", () => {
    const [expiry, signature] = issueToken(config, NOW).split(".");
    const later = `${Number(expiry) + 86_400}.${signature}`;
    assert.ok(!verifyToken(config, later, NOW));
  });

  test("changing the password signs everyone out", () => {
    const token = issueToken(config, NOW);
    assert.ok(!verifyToken({ ...config, password: "another one" }, token, NOW));
  });

  test("changing the secret signs everyone out", () => {
    const token = issueToken(config, NOW);
    assert.ok(!verifyToken({ ...config, secret: "y".repeat(32) }, token, NOW));
  });

  test("junk is refused, not thrown on", () => {
    for (const t of [
      undefined,
      "",
      "abc",
      "1.2.3",
      ".",
      "9999999999.",
      "-1.x",
    ]) {
      assert.ok(!verifyToken(config, t, NOW), String(t));
    }
  });
});

describe("safeNext", () => {
  test("keeps a path inside the panel", () => {
    assert.equal(safeNext("/admin/users/abc-1"), "/admin/users/abc-1");
    assert.equal(safeNext("/admin"), "/admin");
  });

  test("sends anything else to the panel's front", () => {
    for (const n of [
      "//evil.com",
      "https://evil.com",
      "/ops",
      "/admin//x",
      "/admin/..%2f",
      null,
      undefined,
      "",
    ]) {
      assert.equal(safeNext(n), "/admin", String(n));
    }
  });
});
