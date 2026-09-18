import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cx } from "./cx.ts";

describe("cx", () => {
  test("drops falsy parts", () => {
    assert.equal(cx("a", false, null, undefined, "b"), "a b");
  });

  test("a later background overrides an earlier one", () => {
    assert.equal(
      cx("rounded-card border bg-surface", "bg-agent-tint"),
      "rounded-card border bg-agent-tint",
    );
  });

  test("a later padding overrides the component default", () => {
    assert.equal(cx("h-[38px] px-[15px]", "px-5"), "h-[38px] px-5");
  });

  test("custom text sizes and text colours coexist", () => {
    assert.equal(cx("text-mini text-ink-faint"), "text-mini text-ink-faint");
    assert.equal(
      cx("text-small text-agent", "text-micro"),
      "text-agent text-micro",
    );
  });

  test("custom radius, shadow and animation tokens merge as their own groups", () => {
    assert.equal(cx("rounded-card", "rounded-panel"), "rounded-panel");
    assert.equal(cx("shadow-card", "shadow-panel"), "shadow-panel");
    assert.equal(cx("size-2 animate-breathe"), "size-2 animate-breathe");
  });
});
