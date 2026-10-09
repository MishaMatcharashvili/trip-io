This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
pnpm typecheck              # tsc -b: builds the server's types first
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Lint with the repo's Biome (`pnpm lint` from the root), not `npx expo lint`: that scaffolds an
ESLint config the repo does not use. From the root, `pnpm typecheck` checks this app and the web app
together — run it, with `pnpm lint` and `pnpm test`, before declaring any task done. CI runs all
three on every pull request.

## This app lives inside the trip.io web repo

`mobile/` is a pnpm workspace package; the Next.js web app and its API are the root package.
The app's API client is `hc<AppType>()` in `src/api.ts`, typed by the server's own routes.

- Import from the web package with `import type` only. Anything else would bundle server code into
  the phone app; `src/mobile-boundary.test.ts` in the root package fails on it.
- `@/` is the web package's alias. Use `~/` for this app's own modules.
- Type-check with `pnpm typecheck`, never `tsc --noEmit`: the server's declarations come from
  `../tsconfig.api.json` through a project reference, and only `tsc -b` builds them.

## Navigation & Routing

Expo Router, with files under `src/app/`. `src/app/_layout.tsx` keeps the splash up until the stored
session is read, then guards two groups with `Stack.Protected`: `(auth)` (sign in, sign up) when
signed out, `(app)` when signed in. Inside `(app)`, one stack holds:

- `(tabs)`: home. Trips (the first-run composer when there are none), Explore, Saved, Profile.
- `new` and `new/building`: the planner conversation and the build it asks for.
- `trips/[id]/(tabs)`: a trip. Today (the briefing), Map (the trip under way, in its watch states),
  Trip (every day), AI (what the watch said, and a question box).
- Pushed over a trip's tabs: `trips/[id]/day/[date]`, `trips/[id]/stop/[nodeId]`,
  `trips/[id]/watch`, `trips/[id]/versions`, `trips/[id]/pass`.
- `alerts/[id]`, the intervention card, and `push`, a modal shown once.

A tap on a notification opens `alerts/[id]` from `data.interventionId`. Typed routes are off on
purpose: the generated types live under `.expo/`, which is gitignored, so they would make
`pnpm typecheck` mean something different in CI.

Each screen is one in `design/mobile/` (the "trip.io Mobile" project in Claude Design). The phone
reads and decides; editing a day's stops stays on the web, and those screens link out to it.

Read through `client()` and `read()` in `src/api.ts` (`useLoad` in `src/use-load.ts` on a screen);
`read` throws on anything but a 2xx, and `messageOf`/`bodyOf` turn that into words for the screen.
Push is `src/push.ts`: register on every launch, unregister before signing out.

A trip's screens read `/trips/:id/screen` through `loadScreen` in `src/trip.ts`, which also works
out the days, stops and watch states from it. Build screens from the blocks in `src/ui.tsx`.

The map (`src/map.tsx`) is a Mapbox static image, not a map view, so it needs no native module. It
is drawn only when `EXPO_PUBLIC_MAPBOX_TOKEN` is set: a public token of the app's own, since the web
app's is restricted to its URLs. Without one the maps are left out and every screen still works.

## Colours and dark mode

The app follows the system theme (`userInterfaceStyle: "automatic"`). Take every colour from
`usePalette()` in `src/theme.ts`, never inline: those are Mist's tokens mirrored from the web app's
`globals.css`, and `src/mobile-palette.test.ts` in the root package fails if they drift.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
