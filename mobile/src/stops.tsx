import { View } from "react-native";
import { Chevron } from "~/icon";
import { type Stop, stopDetail } from "~/trip";
import { Dot, Line, Small } from "~/ui";

// A stop as every list of stops draws it: the time, a mark for where it
// stands, its title, and the conflict in coral when the watch has matched one.

export function StopLine({
  stop,
  onPress,
}: {
  stop: Stop;
  onPress?: () => void;
}) {
  const now = stop.state === "now";
  return (
    <Line
      title={stop.node.meta.title}
      detail={stopDetail(stop) || null}
      detailTone={stop.conflict ? "alert" : now ? "agent" : undefined}
      bold={now}
      tint={now ? "agent" : undefined}
      dim={stop.state === "done"}
      onPress={onPress}
      leading={
        <>
          <View style={{ width: 40 }}>
            <Small
              mini
              bold={now}
              tone={now ? "agent" : undefined}
              faint={!now}
            >
              {now ? "Now" : stop.time}
            </Small>
          </View>
          <Dot
            tone={stop.conflict ? "alert" : now ? "agent" : undefined}
            ring={stop.state === "next"}
          />
        </>
      }
      trailing={onPress ? <Chevron /> : null}
    />
  );
}
