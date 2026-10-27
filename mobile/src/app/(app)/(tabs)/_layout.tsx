import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { Icon, type IconName } from "~/icon";
import { usePalette } from "~/theme";

const tab =
  (name: IconName) =>
  ({ color }: { color: ColorValue }) => (
    <Icon name={name} size={22} color={color} />
  );

export default function TabsLayout() {
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
        name="index"
        options={{ title: "Trips", tabBarIcon: tab("route") }}
      />
      <Tabs.Screen
        name="explore"
        options={{ title: "Explore", tabBarIcon: tab("explore") }}
      />
      <Tabs.Screen
        name="saved"
        options={{ title: "Saved", tabBarIcon: tab("bookmark") }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: "Profile", tabBarIcon: tab("user") }}
      />
    </Tabs>
  );
}
