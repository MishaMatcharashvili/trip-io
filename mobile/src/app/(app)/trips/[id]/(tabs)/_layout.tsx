import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { Icon, type IconName } from "~/icon";
import { usePalette } from "~/theme";

const tab =
  (name: IconName) =>
  ({ color }: { color: ColorValue }) => (
    <Icon name={name} size={22} color={color} />
  );

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
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: "600" },
        sceneStyle: { backgroundColor: p.canvas },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{ title: "Today", tabBarIcon: tab("calendar") }}
      />
      <Tabs.Screen
        name="map"
        options={{ title: "Map", tabBarIcon: tab("map") }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: "Trip", tabBarIcon: tab("list") }}
      />
      <Tabs.Screen
        name="ai"
        options={{ title: "AI", tabBarIcon: tab("sparkle") }}
      />
    </Tabs>
  );
}
