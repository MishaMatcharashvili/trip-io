import { countUse } from "../dal/usage.ts";
import { dayKey } from "../domain/trip/document.ts";
import {
  type MustSee,
  pinSight,
  routeOf,
  routeWithHome,
} from "../domain/trip/generate/constraints.ts";
import {
  applyEdit,
  fallbackTurn,
  type IntakeMessage,
  type Intaker,
  type IntakeState,
  type IntakeTurn,
  readIntake,
  type Sights,
} from "../domain/trip/generate/intake.ts";
import { intakeWithOpenAI } from "../infra/openai-intake.ts";
import type { FoundHome } from "./home.ts";
import { sightsInPlay } from "./sights.ts";

// One turn of the conversation on /new. The planner is a model; when it is
// unreachable, or answers with something `readIntake` refuses, the turn is
// taken without it, so the page works either way. Nothing here writes a trip.

export type PlanningDeps = {
  intake: Intaker;
  sights: (state: IntakeState, latest: string) => Promise<Sights>;
  count: (key: string, windowSeconds: number, now: Date) => Promise<number>;
  now: () => Date;
  /**
   * A sight the traveller named, as a must-see (sight-search.ts), or null.
   * Without one, a named sight stays in the planner's notes.
   */
  sightNamed?: (
    name: string,
    route: readonly string[],
  ) => Promise<MustSee | null>;
  /**
   * The traveller's home, by the name of its village or town (home.ts), on
   * the route said so far. Without one, the home stays in the notes.
   */
  homeNamed?: (
    name: string,
    route: readonly string[],
  ) => Promise<FoundHome | null>;
};

export type PlanningResult =
  | ({ ok: true; source: "model" | "fallback" } & IntakeTurn)
  | { ok: false; reason: "rate-limited" };

/** A conversation is a dozen turns; this is room for several, not for a script. */
const PER_MINUTE = 10;
const PER_DAY = 150;

export async function planningTurn(
  userId: string,
  state: IntakeState,
  messages: IntakeMessage[],
  overrides: Partial<PlanningDeps> = {},
): Promise<PlanningResult> {
  const deps: PlanningDeps = {
    intake: intakeWithOpenAI,
    sights: sightsInPlay,
    count: countUse,
    now: () => new Date(),
    ...overrides,
  };
  const now = deps.now();
  if (
    (await deps.count(`intake:user:${userId}:m`, 60, now)) > PER_MINUTE ||
    (await deps.count(`intake:user:${userId}:d`, 86_400, now)) > PER_DAY
  ) {
    return { ok: false, reason: "rate-limited" };
  }

  const today = dayKey(now);
  const latest = messages.findLast((m) => m.role === "traveller")?.text ?? "";
  try {
    // Without the catalogue the planner still talks; it just recommends nothing.
    const sights = await deps.sights(state, latest).catch(() => ({}));
    const turn = readIntake(
      await deps.intake({ today, state, messages, sights }),
      state,
      today,
      messages.filter((m) => m.role === "planner").length,
      latest,
    );
    if (turn) {
      return {
        ok: true,
        source: "model",
        ...turn,
        state: await withHome(
          await withSights(turn.state, turn.sights, deps.sightNamed),
          turn.home,
          deps.homeNamed,
        ),
      };
    }
  } catch {
    // Falls through: a turn without the model is better than no turn.
  }
  return {
    ok: true,
    source: "fallback",
    ...fallbackTurn(messages, state, today),
  };
}

/**
 * The state with the sights a turn named pinned, each bringing its town onto
 * the route. One that cannot be found is left to the notes, where the planner
 * keeps a must-see it has no place for; one that fails to be looked up is too.
 */
async function withSights(
  state: IntakeState,
  names: readonly string[],
  find: PlanningDeps["sightNamed"],
): Promise<IntakeState> {
  if (!find || names.length === 0) return state;
  const found = await Promise.all(
    names.map((n) => find(n, routeOf(state.constraints)).catch(() => null)),
  );
  const pinned = found.reduce(
    (c, sight) => (sight ? pinSight(c, sight) : c),
    state.constraints,
  );
  if (pinned === state.constraints) return state;
  return applyEdit(state, { places: pinned.places, mustSee: pinned.mustSee });
}

/**
 * The state with the traveller's home found and placed: its place on the
 * route in place of the wider one that holds it, and its nights free unless
 * the traveller said how many. One that cannot be found, or fails to be
 * looked up, leaves the state as it was; one already held is not looked up
 * again.
 */
async function withHome(
  state: IntakeState,
  name: string | null,
  find: PlanningDeps["homeNamed"],
): Promise<IntakeState> {
  if (!find || !name) return state;
  const c = state.constraints;
  if (c.home?.name.toLowerCase() === name.toLowerCase()) return state;
  const route = state.said.includes("places") ? c.places : [];
  const found = await find(name, route).catch(() => null);
  if (!found) return state;
  return applyEdit(state, {
    home: found.home,
    places: routeWithHome(route, found.home, found.within),
    ...(state.said.includes("freeNights")
      ? {}
      : { freeNights: Math.max(0, c.days - 1) }),
  });
}
