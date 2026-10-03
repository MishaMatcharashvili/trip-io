import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { authClient } from "~/auth";
import { baseUrl } from "~/config";
import { Body, Notice, Screen, Title } from "~/ui";

// Keep the splash up until the stored session has been read: without that the
// sign-in screen flashes for a moment before a signed-in traveller's trips.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending) SplashScreen.hide();
  }, [isPending]);

  if (isPending) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      {baseUrl ? (
        // Signed out, only the auth screens exist; signed in, only the app's.
        // A screen that stops being allowed redirects to the first allowed one.
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={Boolean(session)}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="(auth)" />
          </Stack.Protected>
        </Stack>
      ) : (
        <NotConfigured />
      )}
    </SafeAreaProvider>
  );
}

/** A build made without EXPO_PUBLIC_API_URL: say so, rather than fail oddly. */
function NotConfigured() {
  return (
    <Screen>
      <Title>trip.io</Title>
      <Notice tone="alert">
        <Body>
          This build has no server to talk to. Set EXPO_PUBLIC_API_URL
          (mobile/.env.example) and build again.
        </Body>
      </Notice>
    </Screen>
  );
}
