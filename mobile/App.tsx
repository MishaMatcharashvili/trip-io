import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "./src/api";

// A placeholder screen: it proves the app reaches the API through the typed
// client. The real shell (Phase 7) replaces it.
export default function App() {
  const [status, setStatus] = useState("checking the API…");

  useEffect(() => {
    api.api.health
      .$get()
      .then((res) => res.json())
      .then((body) => setStatus(`API ${body.status} at ${body.time}`))
      .catch((error: unknown) =>
        setStatus(`API unreachable: ${String(error)}`),
      );
  }, []);

  return (
    <View style={styles.container}>
      <Text>{status}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
