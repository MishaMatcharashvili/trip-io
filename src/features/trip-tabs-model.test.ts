import assert from "node:assert/strict";
import { test } from "node:test";
import { activeTab } from "./trip-tabs-model.ts";

test("the map and its replan are the Map tab", () => {
  assert.equal(activeTab(null), "Map");
  assert.equal(activeTab("replan"), "Map");
});

test("the plan and its history are the Trip tab", () => {
  assert.equal(activeTab("trip"), "Trip");
  assert.equal(activeTab("history"), "Trip");
});

test("the AI's record, and anything unknown, is no tab", () => {
  assert.equal(activeTab("alerts"), "");
  assert.equal(activeTab("elsewhere"), "");
});
