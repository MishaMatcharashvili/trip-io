import { corridors } from "../../domain/catalogue/corridors.ts";
import {
  conditionLabels,
  durationLabels,
  hazardLabels,
  type RoadCondition,
  type RoadReportInput,
  reportDurations,
  roadConditions,
  roadHazards,
  shortName,
} from "../../domain/watch/road.ts";

// The road-report form, as screens and buttons, with no Telegram in it.
//
// Stateless on purpose. Each button carries every answer given so far in its
// callback data, so the webhook needs no session store: a serverless function
// can be cold for every tap and still know where the form is. Answers are
// indexes into the domain's own lists, which keeps the longest callback —
// `s:11:4:9:4` — far inside Telegram's 64-byte limit.

export type FormState = {
  corridor?: number;
  condition?: number;
  /** Null means "don't know": asked, and answered with nothing. */
  hazard?: number | null;
  duration?: number;
};

export type Callback =
  | { type: "form"; state: FormState }
  | { type: "send"; state: FormState }
  | { type: "cancel" }
  | { type: "moderate"; decision: "approve" | "reject"; reportId: string };

export type Button = { text: string; data: string };
export type Screen = { text: string; buttons: Button[][] };

// ---------------------------------------------------------------------------
// The codec

const field = (n: number | null | undefined) =>
  n === undefined ? "" : n === null ? "-" : String(n);

const fields = (s: FormState) =>
  [s.corridor, s.condition, s.hazard, s.duration]
    .map(field)
    .join(":")
    .replace(/:+$/, "");

export function encode(callback: Callback): string {
  switch (callback.type) {
    case "form":
      return `f:${fields(callback.state)}`.replace(/:$/, "");
    case "send":
      return `s:${fields(callback.state)}`;
    case "cancel":
      return "x";
    case "moderate":
      return `m:${callback.decision === "approve" ? "a" : "r"}:${callback.reportId}`;
  }
}

const inRange = (value: string, list: readonly unknown[]) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n < list.length ? n : undefined;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Callback data comes from a client, so it is read as untrusted: anything out
 * of range or out of shape is null, and the bot answers it by starting over.
 */
export function decode(data: string): Callback | null {
  if (data === "x") return { type: "cancel" };

  const [kind, ...rest] = data.split(":");
  if (kind === "m") {
    const [decision, reportId] = rest;
    if ((decision !== "a" && decision !== "r") || !UUID.test(reportId ?? "")) {
      return null;
    }
    return {
      type: "moderate",
      decision: decision === "a" ? "approve" : "reject",
      reportId,
    };
  }
  if (kind !== "f" && kind !== "s") return null;

  // An empty field is a question not asked yet — a delay skips the cause, so
  // its answers read `0:2::1` — and must not be read as index 0, which is
  // what `Number("")` would make of it.
  const [c, k, h, d] = rest.map((v) => (v === "" ? undefined : v));
  const state: FormState = {};
  if (c !== undefined) {
    state.corridor = inRange(c, corridors);
    if (state.corridor === undefined) return null;
  }
  if (k !== undefined) {
    state.condition = inRange(k, roadConditions);
    if (state.condition === undefined) return null;
  }
  if (h !== undefined) {
    state.hazard = h === "-" ? null : inRange(h, roadHazards);
    if (state.hazard === undefined) return null;
  }
  if (d !== undefined) {
    state.duration = inRange(d, reportDurations);
    if (state.duration === undefined) return null;
  }
  return kind === "s" ? { type: "send", state } : { type: "form", state };
}

// ---------------------------------------------------------------------------
// The steps

const conditionOf = (s: FormState): RoadCondition | undefined =>
  s.condition === undefined ? undefined : roadConditions[s.condition];

/** Conditions that ask what caused them. "Hazard" must say which. */
const ASKS_CAUSE: readonly RoadCondition[] = ["closed", "restricted", "hazard"];

export type Step = "corridor" | "condition" | "hazard" | "duration" | "confirm";

export function nextStep(state: FormState): Step {
  if (state.corridor === undefined) return "corridor";
  const condition = conditionOf(state);
  if (!condition) return "condition";
  if (condition === "reopened") return "confirm";
  if (ASKS_CAUSE.includes(condition) && state.hazard === undefined) {
    return "hazard";
  }
  if (state.duration === undefined) return "duration";
  return "confirm";
}

/** The form's answers as the domain's input, once there are enough of them. */
export function toInput(state: FormState): RoadReportInput | null {
  if (nextStep(state) !== "confirm") return null;
  const condition = conditionOf(state) as RoadCondition;
  return {
    corridorSlug: corridors[state.corridor as number].slug,
    condition,
    hazard:
      condition === "reopened" || state.hazard == null
        ? null
        : roadHazards[state.hazard],
    duration:
      state.duration === undefined
        ? "unknown"
        : reportDurations[state.duration],
  };
}

const rows = (buttons: Button[], perRow: number): Button[][] => {
  const out: Button[][] = [];
  for (let i = 0; i < buttons.length; i += perRow) {
    out.push(buttons.slice(i, i + perRow));
  }
  return out;
};

const cancelRow: Button[] = [
  { text: "Cancel", data: encode({ type: "cancel" }) },
];

/** The screen for wherever the form is. Pure: the bot only sends it. */
export function screen(state: FormState): Screen {
  const road =
    state.corridor === undefined
      ? ""
      : shortName(corridors[state.corridor].name);

  switch (nextStep(state)) {
    case "corridor":
      return {
        text: "Which road? Pick the stretch you're on or just came off.",
        buttons: [
          ...rows(
            corridors.map((c, i) => ({
              text: shortName(c.name),
              data: encode({ type: "form", state: { corridor: i } }),
            })),
            2,
          ),
          cancelRow,
        ],
      };

    case "condition":
      return {
        text: `${road}: what's it like right now?`,
        buttons: [
          ...roadConditions.map((condition, i) => [
            {
              text: conditionLabels[condition],
              data: encode({
                type: "form",
                state: { corridor: state.corridor, condition: i },
              }),
            },
          ]),
          cancelRow,
        ],
      };

    case "hazard": {
      const condition = conditionOf(state) as RoadCondition;
      const choices = roadHazards.map((hazard, i) => ({
        text: hazardLabels[hazard],
        data: encode({ type: "form", state: { ...state, hazard: i } }),
      }));
      // A hazard report has to say which hazard; a closure may not know why.
      if (condition !== "hazard") {
        choices.push({
          text: "Don't know",
          data: encode({ type: "form", state: { ...state, hazard: null } }),
        });
      }
      return {
        text:
          condition === "hazard"
            ? `${road}: what's on the road?`
            : `${road}: do you know why?`,
        buttons: [...rows(choices, 2), cancelRow],
      };
    }

    case "duration":
      return {
        text: `${road}: how long do people there expect it to last?`,
        buttons: [
          ...rows(
            reportDurations.map((duration, i) => ({
              text: durationLabels[duration],
              data: encode({ type: "form", state: { ...state, duration: i } }),
            })),
            2,
          ),
          cancelRow,
        ],
      };

    case "confirm": {
      const input = toInput(state) as RoadReportInput;
      return {
        text: `Send this report?\n\n${summary(input)}`,
        buttons: [
          [
            { text: "Send", data: encode({ type: "send", state }) },
            { text: "Start over", data: encode({ type: "form", state: {} }) },
          ],
          cancelRow,
        ],
      };
    }
  }
}

/** The report as the reporter and the operator both read it. */
export function summary(input: RoadReportInput): string {
  const road = shortName(
    corridors.find((c) => c.slug === input.corridorSlug)?.name ?? "",
  );
  const lines = [`Road: ${road}`, `Now: ${conditionLabels[input.condition]}`];
  if (input.hazard) lines.push(`Cause: ${hazardLabels[input.hazard]}`);
  if (input.condition !== "reopened") {
    lines.push(`For: ${durationLabels[input.duration]}`);
  }
  return lines.join("\n");
}

/** The two buttons an operator gets under a stranger's report. */
export function moderationButtons(reportId: string): Button[][] {
  return [
    [
      {
        text: "Approve",
        data: encode({ type: "moderate", decision: "approve", reportId }),
      },
      {
        text: "Reject",
        data: encode({ type: "moderate", decision: "reject", reportId }),
      },
    ],
  ];
}
