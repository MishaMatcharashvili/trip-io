// What Explore's filters are called. Plain values, so the screen (a client
// component) and its loading state (drawn on the server) read the same ones.

export const GROUPS = [
  ["heritage", "Heritage"],
  ["nature", "Nature"],
  ["food", "Food & wine"],
  ["culture", "Culture"],
  ["lodging", "Stay"],
] as const;

export const groupName = Object.fromEntries(GROUPS) as Record<string, string>;
