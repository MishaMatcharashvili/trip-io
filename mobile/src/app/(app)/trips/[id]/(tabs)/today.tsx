import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { client, read } from "~/api";
import { dayLabel } from "~/format";
import { RouteMap } from "~/map";
import { currentDay, daysOf, loadScreen, pointsOf } from "~/trip";
import {
  Body,
  Button,
  Card,
  Chip,
  Dot,
  Eyebrow,
  Group,
  Line,
  Loading,
  Notice,
  Row,
  Screen,
  Small,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

// The morning briefing, in the app: what is worth knowing today, the one
// change already proposed, and nothing invented to fill a quiet day. Written
// at 07:30 Tbilisi; before the first one, the screen says so.

async function loadToday(id: string) {
  const [screen, { page }] = await Promise.all([
    loadScreen(id),
    read(client().trips[":id"].briefing.$get({ param: { id } })),
  ]);
  return { screen, page };
}

export default function Today() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadToday(id),
  );

  // Opened, once: the stamp the kill criteria count (src/bll/briefing.ts).
  const briefingId = data?.page?.briefing.id;
  useEffect(() => {
    if (!briefingId) return;
    client()
      .briefings[":id"].opened.$post({ param: { id: briefingId } })
      .catch(() => undefined);
  }, [briefingId]);

  if (!data) {
    return (
      <Screen>
        {error ? <Notice tone="alert">{error}</Notice> : null}
        {loading ? <Loading /> : null}
      </Screen>
    );
  }

  const { screen, page } = data;
  const day = currentDay(daysOf(screen));
  const doc = page?.briefing.document;
  const change = page?.change ?? null;
  const openDay = () =>
    day &&
    router.push({
      pathname: "/trips/[id]/day/[date]",
      params: { id, date: day.key },
    });

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset={false}>
      {day ? <RouteMap points={pointsOf(day.stops)} height={170} /> : null}
      {error ? <Notice tone="alert">{error}</Notice> : null}
      <Row>
        <Chip
          dot={screen.watch ? "ok" : "idle"}
          label={
            screen.watch
              ? `Watching${doc ? ` · ${doc.sources} sources` : ""}`
              : "Not watched"
          }
        />
      </Row>

      <View style={styles.head}>
        <Eyebrow>
          {doc
            ? `Day ${doc.day.index} · ${dayLabel(doc.day.date)}`
            : day
              ? `Day ${day.index} · ${dayLabel(day.key)}`
              : screen.doc.trip.title}
        </Eyebrow>
        <Title>Good morning</Title>
        <Body muted>
          {doc
            ? doc.greeting
            : "Your first briefing arrives at 07:30, Tbilisi time."}
        </Body>
      </View>

      {doc?.lines.length ? (
        <Group>
          {doc.lines.map((line) => (
            <Line
              key={`${line.kind}-${line.title}`}
              title={line.title}
              detail={line.detail}
              leading={<Dot tone={line.tone} />}
              trailing={<Eyebrow>{line.kind}</Eyebrow>}
            />
          ))}
        </Group>
      ) : doc ? (
        <Notice tone="ok">
          Nothing to report this morning. If that changes, I will tell you.
        </Notice>
      ) : (
        <Notice>
          No briefing yet. The first one is written at 07:30 on a morning with
          stops.
        </Notice>
      )}

      {change ? (
        <Card tone="agent" style={styles.change}>
          <Eyebrow>1 change recommended</Eyebrow>
          <Body>{change.sentence}</Body>
          {change.rows.map((row) => (
            <Row key={`${row.from}-${row.to}`}>
              <Small mini faint strike>
                {row.from}
              </Small>
              <Small mini tone="agent">
                →
              </Small>
              <Small mini bold tone="agent">
                {row.to}
              </Small>
            </Row>
          ))}
        </Card>
      ) : null}

      {change?.interventionId ? (
        <Button
          label="Review the change"
          onPress={() =>
            router.push({
              pathname: "/alerts/[id]",
              params: { id: change.interventionId as string },
            })
          }
        />
      ) : null}
      {day ? (
        <Row>
          <View style={styles.grow}>
            <Button
              label="See full day"
              variant="secondary"
              onPress={openDay}
            />
          </View>
          <View style={styles.grow}>
            <Button
              label="Ask something"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: "/trips/[id]/ai", params: { id } })
              }
            />
          </View>
        </Row>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 5 },
  change: { gap: 9 },
  grow: { flex: 1 },
});
