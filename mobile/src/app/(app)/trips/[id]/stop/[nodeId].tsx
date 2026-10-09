import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { client, messageOf, read } from "~/api";
import { dayLabel, duration, words } from "~/format";
import { RouteMap } from "~/map";
import { conflictLine, daysOf, loadScreen, pointsOf, waitingOf } from "~/trip";
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
  Small,
  Stats,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

// One stop: what it is, when, the conflict and the way to its fix, and what
// the watch has matched on it specifically.

async function loadStop(id: string) {
  const [screen, { placeIds }] = await Promise.all([
    loadScreen(id),
    read(client().saved.$get()),
  ]);
  return { screen, saved: new Set(placeIds) };
}

const KIND = {
  visit: "Visit",
  meal: "Meal",
  transfer: "Drive",
  stay: "Stay",
} as const;

export default function Checkpoint() {
  const { id, nodeId } = useLocalSearchParams<{ id: string; nodeId: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadStop(id),
  );
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const days = data ? daysOf(data.screen) : [];
  const day = days.find((d) => d.stops.some((s) => s.id === nodeId));
  const stop = day?.stops.find((s) => s.id === nodeId);

  if (!data || !day || !stop) {
    return (
      <Screen bottomInset>
        {error ? <Notice tone="alert">{error}</Notice> : null}
        {loading ? <Loading /> : null}
        {data ? <Notice>This stop is no longer in the trip.</Notice> : null}
      </Screen>
    );
  }

  const { node, place, at } = stop;
  const matches = data.screen.matches.filter((m) => m.nodeId === nodeId);
  const waiting = waitingOf(data.screen)[0];
  const saved = place ? data.saved.has(place.id) : false;

  const keep = async () => {
    if (!place) return;
    setSaving(true);
    setFailure(null);
    try {
      const target = client().saved.places[":placeId"];
      const param = { placeId: place.id };
      await read(saved ? target.$delete({ param }) : target.$put({ param }));
    } catch (e) {
      setFailure(messageOf(e));
    } finally {
      setSaving(false);
      refresh();
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset>
      <Stack.Screen options={{ title: "" }} />
      <RouteMap
        points={pointsOf(day.stops)}
        mark={at}
        alert={Boolean(stop.conflict)}
        height={200}
      />
      {error ? <Notice tone="alert">{error}</Notice> : null}

      <View style={styles.head}>
        <Eyebrow>
          Checkpoint {day.stops.indexOf(stop) + 1} of {day.stops.length} ·{" "}
          {dayLabel(day.key)}
        </Eyebrow>
        <Title>{node.meta.title}</Title>
        {place ? (
          <Body muted>
            {[words(place.category), place.address].filter(Boolean).join(" · ")}
          </Body>
        ) : null}
      </View>

      <Card>
        <Stats
          items={[
            ["Scheduled", stop.time],
            ["Length", node.durationMin ? duration(node.durationMin) : "—"],
            ["Kind", KIND[node.kind]],
            ["Where", node.indoor ? "Indoors" : "Outdoors"],
          ]}
        />
      </Card>

      {stop.conflict ? (
        <Card tone="alert" style={styles.conflict}>
          <Small bold>The watch has matched something here</Small>
          <Small mini muted>
            {stop.conflict}
          </Small>
          {waiting ? (
            <Button
              label="See the suggested change"
              tone="alert"
              onPress={() =>
                router.push({
                  pathname: "/alerts/[id]",
                  params: { id: waiting.id },
                })
              }
            />
          ) : null}
        </Card>
      ) : null}

      <View style={styles.section}>
        <Eyebrow>What I keep an eye on here</Eyebrow>
        <Group>
          {matches.length ? (
            matches.map((match) => (
              <Line
                key={`${match.kind}-${match.validFrom}`}
                title={conflictLine(match)}
                detail={`Severity ${match.severity}`}
                detailTone="alert"
                leading={<Dot tone="alert" />}
              />
            ))
          ) : (
            <Line
              title={
                data.screen.watch
                  ? "Nothing matched on this stop"
                  : "Not watched yet"
              }
              detail={
                data.screen.watch
                  ? node.indoor
                    ? "Roads to it, and reports that it is shut"
                    : "Weather over it, the roads to it, and reports that it is shut"
                  : "Watching starts with the watch layer"
              }
              leading={<Dot tone={data.screen.watch ? "ok" : undefined} />}
            />
          )}
        </Group>
      </View>

      {node.meta.note ? (
        <View style={styles.section}>
          <Eyebrow>Why it is in your trip</Eyebrow>
          <Body muted>{node.meta.note}</Body>
        </View>
      ) : null}

      {failure ? <Notice tone="alert">{failure}</Notice> : null}
      <Row>
        {at ? (
          <View style={styles.grow}>
            <Button
              label="Directions"
              variant="secondary"
              onPress={() =>
                Linking.openURL(
                  `https://www.google.com/maps/dir/?api=1&destination=${at[1]},${at[0]}`,
                )
              }
            />
          </View>
        ) : null}
        <View style={styles.grow}>
          <Button
            label="Ask about it"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: "/trips/[id]/ai",
                params: { id, q: `About ${node.meta.title}: ` },
              })
            }
          />
        </View>
      </Row>
      {place ? (
        <Button
          label={saved ? "Saved — remove from Saved" : "Save this place"}
          variant="quiet"
          busy={saving}
          onPress={keep}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 6 },
  conflict: { gap: 8 },
  section: { gap: 6 },
  grow: { flex: 1 },
});
