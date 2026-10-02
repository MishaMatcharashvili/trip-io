import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { authClient } from "~/auth";
import { Body, Button, Eyebrow, Field, Notice, Screen, Title } from "~/ui";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: failed } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      // Success needs no navigation: the session changes, and the root layout
      // swaps the auth screens for the app's.
      if (failed) setError(failed.message ?? "That did not work. Try again.");
    } catch {
      setError("Could not reach trip.io. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Eyebrow>trip.io</Eyebrow>
      <Title>Sign in to trip.io</Title>
      <Body muted>
        Your trips, and everything I am watching on them, are waiting where you
        left them.
      </Body>
      <View style={{ gap: 12 }}>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
        />
      </View>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <Button
        label="Sign in"
        onPress={submit}
        busy={busy}
        disabled={!email.trim() || !password}
      />
      <Body muted>
        New to trip.io?{" "}
        <Link href="/sign-up" style={{ fontWeight: "600" }}>
          Create an account
        </Link>
      </Body>
      <Body faint>
        Plan a trip on trip.io in your browser, then sign in here to follow it.
      </Body>
    </Screen>
  );
}
