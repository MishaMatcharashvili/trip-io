/**
 * The four states the active-trip screen has to hold. They are reachable as
 * `?state=` while the screens run on fixtures; once the pipeline is writing
 * verdicts, the state comes from the trip's own watch and intervention rows.
 */
export const screenStates = ["advisory", "calm", "applied", "paused"] as const;

export type ScreenState = (typeof screenStates)[number];

export function parseState(value: string | string[] | undefined): ScreenState {
  return screenStates.includes(value as ScreenState)
    ? (value as ScreenState)
    : "advisory";
}
