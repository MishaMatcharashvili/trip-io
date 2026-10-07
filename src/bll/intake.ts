import { countUse } from "../dal/usage.ts";
import { dayKey } from "../domain/trip/document.ts";
import {
  fallbackTurn,
  type IntakeMessage,
  type Intaker,
  type IntakeState,
  type IntakeTurn,
  readIntake,
} from "../domain/trip/generate/intake.ts";
import { intakeWithOpenAI } from "../infra/openai-intake.ts";

// One turn of the conversation on /new. The planner is a model; when it is
// unreachable, or answers with something `readIntake` refuses, the turn is
// taken without it, so the page works either way. Nothing here writes a trip.

export type PlanningDeps = {
  intake: Intaker;
  count: (key: string, windowSeconds: number, now: Date) => Promise<number>;
  now: () => Date;
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
  try {
    const turn = readIntake(
      await deps.intake({ today, state, messages }),
      state,
      today,
    );
    if (turn) return { ok: true, source: "model", ...turn };
  } catch {
    // Falls through: a turn without the model is better than no turn.
  }
  return {
    ok: true,
    source: "fallback",
    ...fallbackTurn(messages, state, today),
  };
}
