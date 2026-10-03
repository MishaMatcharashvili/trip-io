/**
 * Where the app finds the web package's API, or undefined in a build made
 * without EXPO_PUBLIC_API_URL. Metro inlines the variable at build time.
 */
export const baseUrl = process.env.EXPO_PUBLIC_API_URL;

/** The app's URL scheme (app.json): where Better Auth sends a browser back to. */
export const scheme = "trip-io";
