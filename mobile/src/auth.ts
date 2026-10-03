import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { baseUrl, scheme } from "~/config";

/**
 * Better Auth's client, keeping the session in the keychain (SecureStore).
 *
 * Built even when no API is configured: this module loads before the first
 * screen, and a throw here is a crash at launch with nothing on screen to say
 * why. With no URL every call fails the way an unreachable server does, and
 * the screens name the missing variable (src/app/_layout.tsx).
 */
export const authClient = createAuthClient({
  baseURL: baseUrl ?? "http://api.not-configured.invalid",
  plugins: [
    expoClient({ scheme, storagePrefix: scheme, storage: SecureStore }),
  ],
});
