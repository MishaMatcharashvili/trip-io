import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { client, read } from "~/api";

// Push registration: ask for permission, get this phone's Expo push token, and
// tell the server so an interrupt can reach it (POST /api/devices). The server
// treats a re-registration as "this app is still installed", so it is repeated
// on every launch, not only at the first.
//
// The push itself is sent through Expo's service; APNs and FCM credentials
// live in EAS (context/running-the-pipeline.md).

const TOKEN_KEY = "trip-io.push-token";
const ASKED_KEY = "trip-io.push-asked";

/** Where notification permission stands, as the screens need to say it. */
export type PushState =
  /** Allowed: this phone can be reached. */
  | "on"
  /** Not asked yet, so the system will still show its prompt. */
  | "undetermined"
  /** Refused, in the system prompt or later in Settings. */
  | "off"
  /** A simulator, or a platform with no push: there is nothing to turn on. */
  | "unavailable";

export type Registration = PushState | "not-configured";

/** What the app does with a notification that arrives while it is open. */
export function showNotificationsInApp() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

const canReceive = () =>
  Device.isDevice && (Platform.OS === "ios" || Platform.OS === "android");

export async function pushState(): Promise<PushState> {
  if (!canReceive()) return "unavailable";
  const permission = await Notifications.getPermissionsAsync();
  if (permission.granted) return "on";
  return permission.status === "undetermined" ? "undetermined" : "off";
}

/**
 * Register this phone for push, asking for permission first when `ask` is set
 * and the system will still show its prompt. Returns where that left things.
 */
export async function registerForPush(ask: boolean): Promise<Registration> {
  if (!canReceive()) return "unavailable";

  // Android 13 wants the channel to exist before it will hand out a token.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Changes to your trip",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  let state = await pushState();
  if (state === "undetermined" && ask) {
    await Notifications.requestPermissionsAsync();
    state = await pushState();
  }
  if (state !== "on") return state;

  // `eas init` writes the project id into the config; a build made before that
  // has none, and Expo cannot issue a token without it.
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return "not-configured";

  const { data: token } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  await read(
    client().devices.$post({
      json: { token, platform: Platform.OS as "ios" | "android" },
    }),
  );
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return "on";
}

/**
 * Sign this phone out of push. Called before the session ends, because the
 * server only lets a token's own user unregister it. A failure is swallowed:
 * someone who cannot reach the server must still be able to sign out, and a
 * dead token is disabled by the push service on its first refusal.
 */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    await read(client().devices.unregister.$post({ json: { token } }));
  } catch {
    // See above.
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}

/** Whether the app has already explained push and asked, once. */
export const pushAsked = async () =>
  (await SecureStore.getItemAsync(ASKED_KEY)) === "1";

export const markPushAsked = () => SecureStore.setItemAsync(ASKED_KEY, "1");
