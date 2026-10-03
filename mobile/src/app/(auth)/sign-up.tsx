import { Link } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { authClient } from "~/auth";
import { Body, Button, Eyebrow, Field, Notice, Screen, Title } from "~/ui";

const MIN_PASSWORD = 8;

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { error: failed } = await authClient.signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
      });
      // As with sign-in, the new session is what moves the traveller on.
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
      <Title>Create an account</Title>
      <Body muted>Keep your trips, and let me watch them.</Body>
      <View style={{ gap: 12 }}>
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
        />
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
          hint={`At least ${MIN_PASSWORD} characters.`}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          onSubmitEditing={submit}
        />
      </View>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <Button
        label="Create account"
        onPress={submit}
        busy={busy}
        disabled={
          !name.trim() || !email.trim() || password.length < MIN_PASSWORD
        }
      />
      <Body muted>
        Already have an account?{" "}
        <Link href="/sign-in" style={{ fontWeight: "600" }}>
          Sign in
        </Link>
      </Body>
    </Screen>
  );
}
