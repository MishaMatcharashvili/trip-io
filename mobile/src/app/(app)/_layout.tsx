import * as Notifications from "expo-notifications";
import { Stack, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import {
  pushAsked,
  pushState,
  registerForPush,
  showNotificationsInApp,
} from "~/push";
import { usePalette } from "~/theme";

showNotificationsInApp();

/** The interrupt a notification is about, from the payload the server sent. */
function interventionOf(response: Notifications.NotificationResponse | null) {
  if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
    return null;
  }
  const id = response.notification.request.content.data?.interventionId;
  return typeof id === "string" ? id : null;
}

export default function AppLayout() {
  const palette = usePalette();
  const router = useRouter();

  // A tap on a notification, from a cold start or with the app open, goes to
  // the card it is about. The same response can be read again on a re-render.
  const response = Notifications.useLastNotificationResponse();
  const opened = useRef<string | null>(null);
  useEffect(() => {
    const id = interventionOf(response ?? null);
    const key = response?.notification.request.identifier ?? null;
    if (!id || key === opened.current) return;
    opened.current = key;
    router.push({ pathname: "/alerts/[id]", params: { id } });
  }, [response, router]);

  // On launch: a phone that can already be reached says it is still here; one
  // that has never been asked gets the explanation before the system prompt.
  useEffect(() => {
    (async () => {
      const state = await pushState();
      if (state === "on") {
        await registerForPush(false);
      } else if (state === "undetermined" && !(await pushAsked())) {
        router.push("/push");
      }
    })().catch(() => undefined);
  }, [router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.canvas },
        headerTintColor: palette.ink,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: palette.canvas },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="trips/[id]/index" options={{ title: "" }} />
      <Stack.Screen
        name="trips/[id]/watch"
        options={{ title: "Notifications" }}
      />
      <Stack.Screen name="alerts/[id]" options={{ title: "A change" }} />
      <Stack.Screen
        name="push"
        options={{ presentation: "modal", headerShown: false }}
      />
    </Stack>
  );
}
