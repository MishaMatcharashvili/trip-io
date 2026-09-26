import { useColorScheme } from "react-native";

// The Mist palette's base colours, mirrored from the web app's tokens in
// src/app/globals.css (`--color-canvas`, `--color-ink`).
// React Native cannot read CSS variables, so a change there is a change here;
// src/mobile-palette.test.ts fails until both agree.
// The app follows the system theme (`userInterfaceStyle: "automatic"`), so
// every colour a screen uses must come from here, never be written inline.

const light = {
  canvas: "#f7f9fb",
  ink: "#1d232a",
};

const dark: typeof light = {
  canvas: "#0f1318",
  ink: "#e6eaee",
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}
