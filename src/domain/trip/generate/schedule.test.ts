import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sortedNodes, type TripDoc } from "../document.ts";
import {
  at,
  candidates,
  DAY,
  idSequence,
  P,
  PREV,
  places,
} from "../test-fixtures.ts";
import { straightLineTravel } from "../travel.ts";
import { validateDoc } from "../validate.ts";
import type { Plan, PlanStop } from "./plan.ts";
import { schedule } from "./schedule.ts";

const stop = (
  placeId: string,
  slot: PlanStop["slot"],
  kind: PlanStop["kind"],
  durationMin: number,
): PlanStop => ({ placeId, slot, kind, durationMin });

// Day 1 (PREV) arrives at Gudauri; day 2 (DAY) is the Kazbegi day.
const kazbegiPlan = (day2: PlanStop[] = []): Plan => ({
  days: [
    {
      day: 1,
      theme: "Up the Military Road",
      stayId: P.roomsGudauri,
      stops: [stop(P.friendship, "afternoon", "visit", 40)],
    },
    {
      day: 2,
      theme: "Kazbegi",
      stayId: P.roomsKazbegi,
      stops: day2.length
        ? day2
        : [
            stop(P.roomsGudauri, "morning", "meal", 45),
            stop(P.zetaCamp, "midday", "meal", 75),
            stop(P.gergeti, "afternoon", "visit", 160),
            stop(P.cafe5047, "evening", "meal", 90),
          ],
    },
  ],
});

const run = (plan: Plan) =>
  schedule({
    plan,
    startDate: PREV,
    pace: "moderate",
    places: candidates,
    travel: straightLineTravel,
    newId: idSequence(),
  });

const timeline = (nodes: TripDoc["nodes"]) =>
  sortedNodes(nodes).map(({ node }) => {
    const hhmm = new Date(Date.parse(node.startsAt) + 4 * 3_600_000)
      .toISOString()
      .slice(11, 16);
    return `${hhmm} ${node.kind} ${node.meta.title} (${node.durationMin})`;
  });

describe("schedule", () => {
  test("times the Kazbegi plan, inserting the drive", () => {
    const { nodes, problems } = run(kazbegiPlan());
    assert.deepEqual(problems, []);
    assert.deepEqual(timeline(nodes), [
      "14:30 visit Friendship Monument viewpoint (40)",
      "15:35 stay Check in · Rooms Gudauri (15)",
      "09:00 meal Breakfast · Rooms Gudauri (45)",
      "09:45 transfer Drive to Zeta Camp (40)",
      "12:30 meal Lunch · Zeta Camp (75)",
      "14:30 visit Gergeti Trinity Church (160)",
      "19:00 meal Dinner · Cafe 5047m (90)",
      "20:30 stay Check in · Rooms Kazbegi (15)",
    ]);
  });

  test("what it produces passes the day checker as a system patch", () => {
    const { nodes } = run(kazbegiPlan());
    const doc: TripDoc = {
      trip: {
        title: "t",
        startsAt: at(PREV, "00:00"),
        endsAt: at(DAY, "23:59"),
        party: {},
        pace: "moderate",
        budget: "",
        prefs: {},
      },
      nodes,
    };
    const errors = validateDoc(doc, {
      places,
      travel: straightLineTravel,
      author: "system",
    }).filter((v) => v.severity === "error");
    assert.deepEqual(errors, []);
  });

  test("pushes a stop later within its slot until the place is open", () => {
    // Cafe 5047m opens at noon; the morning slot runs until 12:00.
    const { nodes, problems } = run(
      kazbegiPlan([stop(P.cafe5047, "morning", "meal", 60)]),
    );
    assert.deepEqual(problems, []);
    assert.ok(
      timeline(nodes).includes("12:00 meal Breakfast · Cafe 5047m (60)"),
    );
  });

  test("reports a place that is closed all slot and leaves it out", () => {
    // The museum is closed on Wednesdays.
    const { nodes, problems } = run(
      kazbegiPlan([stop(P.museum, "afternoon", "visit", 90)]),
    );
    assert.equal(problems.length, 1);
    assert.equal(problems[0].placeId, P.museum);
    assert.equal(problems[0].day, DAY);
    assert.ok(!Object.values(nodes).some((n) => n.placeId === P.museum));
  });

  test("reports an outdoor visit that can't end before dark", () => {
    const { problems } = run(
      kazbegiPlan([stop(P.gergeti, "evening", "visit", 160)]),
    );
    assert.match(problems[0].message, /after dark/);
  });

  test("reports a place that isn't a candidate", () => {
    const { problems } = run(
      kazbegiPlan([
        stop("10000000-0000-4000-8000-0000000000ff", "morning", "visit", 60),
      ]),
    );
    assert.equal(problems.length, 1);
  });

  test("a multi-night base is one stay node", () => {
    const plan = kazbegiPlan();
    plan.days[1].stayId = P.roomsGudauri;
    plan.days[1].stops = [stop(P.friendship, "morning", "visit", 40)];
    const stays = Object.values(run(plan).nodes).filter(
      (n) => n.kind === "stay",
    );
    assert.equal(stays.length, 1);
  });
});
