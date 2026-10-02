import { useCallback, useEffect, useState } from "react";
import { Linking } from "react-native";
import { authClient } from "~/auth";
import {
  type PushState,
  pushState,
  registerForPush,
  unregisterPush,
} from "~/push";
import {
  Body,
  Button,
  Card,
  Eyebrow,
  Heading,
  Notice,
  Screen,
  Title,
} from "~/ui";

export default function Account() {
  const { data: session } = authClient.useSession();
  const [push, setPush] = useState<PushState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const readPush = useCallback(
    () => pushState().then(setPush, () => setPush("unavailable")),
    [],
  );
  useEffect(() => void readPush(), [readPush]);

  const turnOn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if ((await registerForPush(true)) === "not-configured") {
        setNotice("This build is not set up for notifications yet.");
      }
    } catch {
      setNotice("Could not turn notifications on. Try again in a moment.");
    } finally {
      setBusy(false);
      void readPush();
    }
  };

  const signOut = async () => {
    setBusy(true);
    // While the session still exists: the server only lets a token's own user
    // sign it out, and the next person to hold this phone must not receive the
    // last one's interrupts.
    await unregisterPush();
    await authClient.signOut();
    setBusy(false);
  };

  return (
    <Screen>
      <Title>Account</Title>
      <Card>
        <Heading>{session?.user.name}</Heading>
        <Body muted>{session?.user.email}</Body>
      </Card>

      <Eyebrow>Notifications</Eyebrow>
      <Card>
        {push === "on" ? (
          <Body>
            On. I will reach this phone when something changes on a trip. Set
            each trip’s limits and quiet hours from the trip.
          </Body>
        ) : null}
        {push === "undetermined" ? (
          <>
            <Body muted>
              Off. Turn notifications on to be told about a change while it
              still matters.
            </Body>
            <Button
              label="Turn on notifications"
              onPress={turnOn}
              busy={busy}
            />
          </>
        ) : null}
        {push === "off" ? (
          <>
            <Body muted>
              Off in this phone’s settings. Allow them there and I can reach
              you.
            </Body>
            <Button
              label="Open settings"
              variant="secondary"
              onPress={() => Linking.openSettings()}
            />
          </>
        ) : null}
        {push === "unavailable" ? (
          <Body muted>
            This device cannot receive notifications. A simulator cannot; a
            phone can.
          </Body>
        ) : null}
      </Card>
      {notice ? <Notice tone="alert">{notice}</Notice> : null}

      <Body faint>The app follows your phone’s light or dark setting.</Body>
      <Button
        label="Sign out"
        variant="secondary"
        onPress={signOut}
        busy={busy}
      />
    </Screen>
  );
}
