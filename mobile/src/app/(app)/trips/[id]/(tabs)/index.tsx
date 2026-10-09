import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, StyleSheet, View } from "react-native";
import { baseUrl } from "~/config";
import { dateRange } from "~/format";
import { Chevron } from "~/icon";
import { daysOf, loadScreen } from "~/trip";
import {
  Body,
  Button,
  Card,
  Dot,
  Eyebrow,
  Group,
  Line,
  Loading,
  Notice,
  Row,
  Screen,
  Shape,
  Small,
  Stats,
  Tap,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

// The whole trip: every day with a watch status, which is where the product
// stops being a planner. Each row says whether anything moved under it.

export default function FullTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadScreen(id),
  );
  const to = (
    pathname: "/trips/[id]/watch" | "/trips/[id]/versions" | "/trips/[id]/pass",
  ) => router.push({ pathname, params: { id } });

  if (!data) {
    return (
      <Screen>
        {error ? <Notice tone="alert">{error}</Notice> : null}
        {loading ? <Loading /> : null}
      </Screen>
    );
  }

  const header = data.doc.trip;
  const days = daysOf(data);
  const places = Object.keys(data.places).length;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset={false}>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <View style={styles.head}>
        <Title>{header.title}</Title>
        <Body muted>
          {dateRange(header.startsAt, header.endsAt)} · {days.length}{" "}
          {days.length === 1 ? "day" : "days"}
        </Body>
      </View>

      <Card>
        <Stats
          items={[
            ["Stops", String(Object.keys(data.doc.nodes).length)],
            ["Places", String(places)],
            ["Changes", `${data.alerts.applied} handled`],
          ]}
        />
      </Card>

      {days.length === 0 ? (
        <Notice>
          This trip has no stops yet. Add them on trip.io in your browser.
        </Notice>
      ) : (
        <Group>
          {days.map((day) => (
            <Tap
              key={day.key}
              label={day.stamp}
              onPress={() =>
                router.push({
                  pathname: "/trips/[id]/day/[date]",
                  params: { id, date: day.key },
                })
              }
            >
              <Row
                gap={12}
                style={[styles.day, day.state === "past" && styles.past]}
              >
                <View style={styles.dayText}>
                  <Eyebrow>{day.stamp}</Eyebrow>
                  <Small bold={day.state === "today"}>{day.summary}</Small>
                  <Shape segments={day.segments} />
                </View>
                <Row gap={6}>
                  <Dot
                    tone={
                      day.watch.tone === "idle" ? undefined : day.watch.tone
                    }
                  />
                  <Small
                    mini
                    bold={day.watch.tone === "alert"}
                    tone={day.watch.tone === "alert" ? "alert" : undefined}
                    muted
                  >
                    {day.watch.label}
                  </Small>
                </Row>
              </Row>
            </Tap>
          ))}
        </Group>
      )}

      <Group>
        <Line
          title="Changes I proposed"
          trailing={
            <Small bold>
              {data.alerts.told} · {data.alerts.applied} applied
            </Small>
          }
        />
        <Line
          title="Checks run on this trip"
          trailing={
            <Small bold>{data.alerts.checks.toLocaleString("en")}</Small>
          }
        />
      </Group>

      <Group>
        <Line
          title="What I watch, and quiet hours"
          detail={
            data.watch
              ? `At most ${data.watch.cap} interrupts on this trip`
              : "Not watched yet"
          }
          trailing={<Chevron />}
          onPress={() => to("/trips/[id]/watch")}
        />
        <Line
          title="Versions of your trip"
          detail={`${data.history.length} ${data.history.length === 1 ? "change" : "changes"} kept`}
          trailing={<Chevron />}
          onPress={() => to("/trips/[id]/versions")}
        />
        <Line
          title="The watch layer"
          detail="Planning is free. Watching is what you pay for."
          trailing={<Chevron />}
          onPress={() => to("/trips/[id]/pass")}
        />
      </Group>

      {baseUrl ? (
        <Button
          label="Edit the trip on trip.io"
          variant="quiet"
          onPress={() => Linking.openURL(`${baseUrl}/trips/${id}`)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  day: { paddingHorizontal: 14, paddingVertical: 10 },
  dayText: { flex: 1, gap: 4 },
  past: { opacity: 0.6 },
});
