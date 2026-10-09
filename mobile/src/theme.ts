import { useColorScheme } from "react-native";

// The Mist palette, mirrored from the web app's tokens in src/app/globals.css.
// React Native cannot read CSS variables, so a change there is a change here;
// src/mobile-palette.test.ts fails until both agree. Each key is its token in
// camelCase: `ink-muted` is `inkMuted`.
//
// Colour does three jobs: agent (periwinkle) is the agent and its primary
// actions, alert (coral) is a real disruption, ok (green) is all clear.
//
// The app follows the system theme (`userInterfaceStyle: "automatic"`), so
// every colour a screen uses must come from here, never be written inline.

const light = {
  canvas: "#f7f9fb",
  surface: "#ffffff",
  surfaceSubtle: "#fbfcfd",
  fill: "#eaeff3",
  fillStrong: "#dce4ea",
  track: "#eff2f5",
  trackPill: "#edf1f4",
  hairline: "#e7ecf0",
  hairlineStrong: "#e1e7ec",
  control: "#d6dee5",
  ink: "#1d232a",
  inkMuted: "#616c77",
  inkFaint: "#939da6",
  inkIdle: "#c6d0d8",
  agent: "#4a63e7",
  agentSoft: "#c9d0f7",
  agentLine: "#d8ddfb",
  agentTint: "#eef0fe",
  alert: "#c8492c",
  alertBright: "#e2664a",
  alertSoft: "#f3c0b0",
  alertLine: "#f6d9d0",
  alertTint: "#fdf0ec",
  ok: "#1d7a57",
  okLine: "#cfe9df",
  okTint: "#eaf6f1",
  onAccent: "#ffffff",
  knob: "#ffffff",
};

const dark: typeof light = {
  canvas: "#0f1318",
  surface: "#171c22",
  surfaceSubtle: "#1b2129",
  fill: "#232a33",
  fillStrong: "#2d3640",
  track: "#212830",
  trackPill: "#1c232b",
  hairline: "#262e37",
  hairlineStrong: "#2c353f",
  control: "#3a4450",
  ink: "#e6eaee",
  inkMuted: "#a3adb7",
  inkFaint: "#7a8591",
  inkIdle: "#4a5561",
  agent: "#8a9bf7",
  agentSoft: "#3a4580",
  agentLine: "#333d6e",
  agentTint: "#1c2240",
  alert: "#f08a70",
  alertBright: "#f0876b",
  alertSoft: "#6b3326",
  alertLine: "#4d2c24",
  alertTint: "#2a1b18",
  ok: "#5cc79a",
  okLine: "#1f4a39",
  okTint: "#13261f",
  onAccent: "#0f1318",
  knob: "#e6eaee",
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}
