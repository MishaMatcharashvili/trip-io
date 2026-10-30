import { countUse } from "../dal/usage.ts";
import { dayKey } from "../domain/trip/document.ts";
import {
  type MustSee,
  pinSight,
  routeOf,
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
        state: await withSights(turn.state, turn.sights, deps.sightNamed),
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
