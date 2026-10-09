import { Tabs } from "expo-router";
import { usePalette } from "~/theme";

// Inside a trip: the day, the map, the whole trip, and what the agent has
// said. The trip's other screens (a day, a stop, its settings) are pushed over
// these by the stack in ../../../_layout.tsx.

export default function TripTabsLayout() {
  const p = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.agent,
        tabBarInactiveTintColor: p.inkFaint,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.hairline },
        // No glyphs: the tabs are named, and the label is the affordance.
        tabBarIcon: () => null,
        tabBarLabelStyle: { fontSize: 13, fontWeight: "600" },
        tabBarIconStyle: { display: "none" },
        sceneStyle: { backgroundColor: p.canvas },
      }}
    >
      <Tabs.Screen name="today" options={{ title: "Today" }} />
      <Tabs.Screen name="map" options={{ title: "Map" }} />
      <Tabs.Screen name="index" options={{ title: "Trip" }} />
      <Tabs.Screen name="ai" options={{ title: "AI" }} />
    </Tabs>
  );
}
