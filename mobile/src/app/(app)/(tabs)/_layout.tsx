import { Tabs } from "expo-router";
import { usePalette } from "~/theme";

export default function TabsLayout() {
  const p = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.agent,
        tabBarInactiveTintColor: p.inkFaint,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.hairline },
        // No glyphs: the two tabs are named, and the label is the affordance.
        tabBarIcon: () => null,
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        tabBarIconStyle: { display: "none" },
        sceneStyle: { backgroundColor: p.canvas },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Trips" }} />
      <Tabs.Screen name="account" options={{ title: "Account" }} />
    </Tabs>
  );
}
