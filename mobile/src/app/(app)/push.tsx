import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { markPushAsked, registerForPush } from "~/push";
import { Body, Button, Eyebrow, Notice, Screen, Title } from "~/ui";

// Shown once, before the system's own prompt: the system asks a single time,
// and a refusal is only undone in Settings. So the app says what it will use
// the permission for first, and "not now" costs nothing — the morning
// briefing still reaches the traveller by email.

export default function PushPermission() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const done = async () => {
    await markPushAsked().catch(() => undefined);
    router.back();
  };

  const turnOn = async () => {
    setBusy(true);
    try {
      const result = await registerForPush(true);
      if (result === "not-configured") {
        setNotice("This build is not set up for notifications yet.");
        await markPushAsked().catch(() => undefined);
        return;
      }
      await done();
    } catch {
      setNotice("Could not turn notifications on. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Eyebrow>Notifications</Eyebrow>
      <Title>Let me reach you when it matters</Title>
      <Body muted>
        Most days I will have nothing to say. When I do, it is worth a
        notification.
      </Body>
      <View style={{ gap: 12 }}>
        <Point
          title="A disruption in the next two hours"
          text="Weather or a road closure that touches a stop on your plan."
        />
        <Point
          title="Only a few on each trip"
          text="There is a cap, and none of them arrive in your quiet hours."
        />
        <Point
          title="Everything else waits for you"
          text="Later changes and opportunities are in the app and the morning briefing."
        />
      </View>
      {notice ? <Notice tone="alert">{notice}</Notice> : null}
      <Button label="Turn on notifications" onPress={turnOn} busy={busy} />
      <Button label="Not now" variant="quiet" onPress={done} disabled={busy} />
    </Screen>
  );
}

function Point({ title, text }: { title: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Body style={{ fontWeight: "600" }}>{title}</Body>
      <Body muted>{text}</Body>
    </View>
  );
}
