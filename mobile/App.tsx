import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { api } from "./src/api";

// A placeholder screen: it proves the app reaches the API through the typed
// client. The real shell (Phase 7) replaces it.
export default function App() {
  const [status, setStatus] = useState("checking the API…");

  useEffect(() => {
    if (!api) {
      setStatus("No API configured: EXPO_PUBLIC_API_URL is not set");
      return;
    }
    let live = true;
    api.api.health
      .$get()
      .then((res) => {
        // A 5xx, or a captive portal or the wrong port answering 200 with
        // HTML: name it, rather than surfacing a JSON parse error.
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.headers.get("content-type")?.includes("application/json")) {
          throw new Error(`HTTP ${res.status}, but not JSON`);
        }
        return res.json();
      })
      .then((body) => live && setStatus(`API ${body.status} at ${body.time}`))
      .catch(
        (error: unknown) =>
          live && setStatus(`API unreachable: ${String(error)}`),
      );
    return () => {
      live = false;
    };
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
