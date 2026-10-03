import {
  conditionLabels,
  describeRail,
  durationLabels,
  type RailReportInput,
  railConditions,
  railDurations,
  railRoutes,
} from "../../domain/watch/rail.ts";
import type { Button, Screen } from "./form.ts";

// The rail form: line, then what the trains are doing, then for how long.
// Stateless like the road form — each button carries every answer so far, so a
// cold serverless function can take any tap. Prefixes are `rf` (a step) and
// `rs` (send), apart from the road form's `f` and `s`.

export type RailState = {
  route?: number;
  condition?: number;
  duration?: number;
};

export type RailCallback =
  | { type: "rail-form"; state: RailState }
  | { type: "rail-send"; state: RailState };

const field = (n: number | undefined) => (n === undefined ? "" : String(n));

export function encodeRail(c: RailCallback): string {
  const { route, condition, duration } = c.state;
  const body = [route, condition, duration]
    .map(field)
    .join(":")
    .replace(/:+$/, "");
  return `${c.type === "rail-send" ? "rs" : "rf"}:${body}`.replace(/:$/, "");
}

const inRange = (v: string | undefined, list: readonly unknown[]) => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < list.length ? n : null;
};

/** Untrusted input: out of range or out of shape is null. */
export function decodeRail(data: string): RailCallback | null {
  const [kind, r, k, d] = data.split(":");
  if (kind !== "rf" && kind !== "rs") return null;
  const route = inRange(r, railRoutes);
  const condition = inRange(k, railConditions);
  const duration = inRange(d, railDurations);
  if (route === null || condition === null || duration === null) return null;
  const state: RailState = {};
  if (route !== undefined) state.route = route;
  if (condition !== undefined) state.condition = condition;
  if (duration !== undefined) state.duration = duration;
  return { type: kind === "rs" ? "rail-send" : "rail-form", state };
}

/** "Running normally" has no duration to ask. */
export function toRailInput(s: RailState): RailReportInput | null {
  if (s.route === undefined || s.condition === undefined) return null;
  const condition = railConditions[s.condition];
  if (condition !== "running" && s.duration === undefined) return null;
  return {
    route: railRoutes[s.route].slug,
    condition,
    duration: railDurations[s.duration ?? 0],
  };
}

const cancel: Button = { text: "Cancel", data: "x" };

export function railScreen(s: RailState): Screen {
  if (s.route === undefined) {
    return {
      text: "Which line?",
      buttons: [
        ...railRoutes.map((r, i) => [
          {
            text: r.name,
            data: encodeRail({ type: "rail-form", state: { route: i } }),
          },
        ]),
        [cancel],
      ],
    };
  }
  const name = railRoutes[s.route].name;
  if (s.condition === undefined) {
    return {
      text: `${name}: what are the trains doing?`,
      buttons: [
        ...railConditions.map((c, i) => [
          {
            text: conditionLabels[c],
            data: encodeRail({
              type: "rail-form",
              state: { route: s.route, condition: i },
            }),
          },
        ]),
        [cancel],
      ],
    };
  }
  const input = toRailInput(s);
  if (!input) {
    return {
      text: `${name}: ${conditionLabels[railConditions[s.condition]].toLowerCase()}. For how long?`,
      buttons: [
        ...railDurations.map((d, i) => [
          {
            text: durationLabels[d],
            data: encodeRail({
              type: "rail-form",
              state: { ...s, duration: i },
            }),
          },
        ]),
        [cancel],
      ],
    };
  }
  return {
    text: `Send this?\n\n${describeRail(input)}`,
    buttons: [
      [{ text: "Send", data: encodeRail({ type: "rail-send", state: s }) }],
      [cancel],
    ],
  };
}
