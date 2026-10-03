import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { menuLinks, whoLine } from "./account-menu-model.ts";

const member = { kind: "member", name: "Mari", email: "m@x.ge" } as const;
const labels = (links: ReturnType<typeof menuLinks>) =>
  links.map((l) => l.label);

describe("the menu", () => {
  test("in a trip it carries the AI's record and the watch's settings, for that trip", () => {
    const links = menuLinks("abc", member);
    const ai = links.find((l) => l.label.startsWith("Everything"));
    assert.equal(ai?.href, "/trips/abc/alerts");
    assert.equal(
      links.find((l) => l.label === "Watch settings")?.href,
      "/trips/abc/watch",
    );
  });

  test("outside a trip there are none of the trip's", () => {
    const links = menuLinks(undefined, member);
    assert.ok(!labels(links).includes("Watch settings"));
    assert.ok(!labels(links).some((l) => l.startsWith("Everything")));
    assert.ok(labels(links).includes("Account"));
  });

  test("signed out, it offers sign-in and no trip pages, which would bounce", () => {
    const links = menuLinks("abc", { kind: "signed-out" });
    assert.deepEqual(labels(links), ["Sign in", "Create an account", "Plans"]);
  });

  test("a guest is offered an account that keeps the trip", () => {
    const links = menuLinks("abc", { kind: "guest" });
    assert.ok(labels(links).includes("Create an account"));
    assert.ok(labels(links).includes("Account"));
  });

  test("before it is known who is asking, the trip's pages are there and no sign-in is", () => {
    const links = labels(menuLinks("abc", { kind: "unknown" }));
    assert.ok(links.includes("Watch settings"));
    assert.ok(!links.includes("Sign in"));
  });
});

test("the head of the menu names who is signed in, when it can", () => {
  assert.deepEqual(whoLine(member), { title: "Mari", detail: "m@x.ge" });
  assert.equal(whoLine({ kind: "unknown" }), null);
  assert.equal(whoLine({ kind: "signed-out" }), null);
});
