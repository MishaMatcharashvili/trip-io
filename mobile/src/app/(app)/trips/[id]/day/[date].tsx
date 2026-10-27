import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, StyleSheet, View } from "react-native";
import { client, read } from "~/api";
import { baseUrl } from "~/config";
import { dayLabel, timeOf } from "~/format";
import { StopLine } from "~/stops";
import { usePalette } from "~/theme";
import { daysOf, loadScreen, pointsOf, waitingOf } from "~/trip";
import {
  Button,
  Card,
  Chip,
  Eyebrow,
  Group,
  Loading,
  Notice,
  Row,
  Screen,
  Small,
} from "~/ui";
import { useLoad } from "~/use-load";

// One day, expanded: the rain over the hours the traveller is awake, every
// stop with where it stands, and any conflict marked in coral. Editing the
// day — adding, moving, reordering — is the web app's.

/** The ribbon covers the waking day. */
const FROM_HOUR = 9;
const TO_HOUR = 21;
/** Millimetres an hour that count as rain, and as heavy rain. */
const WET = 0.3;
const HEAVY = 2;

async function loadDay(id: string, date: string) {
  const screen = await loadScreen(id);
  const day = daysOf(screen).find((d) => d.key === date);
  const at = day ? pointsOf(day.stops)[0] : undefined;
  // The ribbon is a convenience: a day never fails to load for want of it.
  const hours = at
    ? await read(
        client().trips[":id"].forecast.$get({
          param: { id },
          query: { date, near: `${at[0]},${at[1]}` },
        }),
      ).then(
        (r) => r.hours,
        () => null,
      )
    : null;
  return { screen, hours };
}

const hourOf = (instant: string) => Number(timeOf(instant).slice(0, 2));

export default function DayDetail() {
  const p = usePalette();
  const { id, date } = useLocalSearchParams<{ id: string; date: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadDay(id, date),
  );

  const days = data ? daysOf(data.screen) : [];
  const day = days.find((d) => d.key === date);
  const waiting = data ? waitingOf(data.screen)[0] : undefined;
  const done = day?.stops.filter((s) => s.state === "done").length ?? 0;

  const ribbon = (data?.hours ?? []).filter((h) => {
    const hour = hourOf(h.at);
    return hour >= FROM_HOUR && hour <= TO_HOUR;
  });
  const wet = ribbon.filter((h) => h.precipitation >= WET);
  const peak = Math.max(HEAVY, ...ribbon.map((h) => h.precipitation));

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset>
      <Stack.Screen options={{ title: dayLabel(date) }} />
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {loading ? <Loading /> : null}

      {data && !day ? <Notice>Nothing is planned on this day.</Notice> : null}

      {day ? (
        <>
          <Row>
            <View style={styles.grow}>
              <Eyebrow>
                Day {day.index} of {days.length}
              </Eyebrow>
              <Small bold>{day.summary}</Small>
            </View>
            <Chip label={`${done}/${day.stops.length} done`} />
          </Row>

          {ribbon.length ? (
            <View style={styles.ribbon}>
              <View style={styles.bars}>
                {ribbon.map((h) => (
                  <View
                    key={h.at}
                    style={{
                      flex: 1,
                      borderRadius: 2,
                      height: 8 + Math.round((h.precipitation / peak) * 14),
                      backgroundColor:
                        h.precipitation >= HEAVY
                          ? p.alertBright
                          : h.precipitation >= WET
                            ? p.alertSoft
                            : p.fillStrong,
                    }}
                  />
                ))}
              </View>
              <Row>
                <Eyebrow>{timeOf(ribbon[0].at).slice(0, 2)}</Eyebrow>
                <View style={styles.centre}>
                  {wet.length ? (
                    <Small mini bold tone="alert">
                      Rain {timeOf(wet[0].at)}–{timeOf(wet[wet.length - 1].at)}
                    </Small>
                  ) : (
                    <Small mini faint>
                      Dry through the day
                    </Small>
                  )}
                </View>
                <Eyebrow>
                  {timeOf(ribbon[ribbon.length - 1].at).slice(0, 2)}
                </Eyebrow>
              </Row>
            </View>
          ) : null}

          {waiting ? (
            <Card tone={waiting.tone}>
              <Row gap={11}>
                <View style={styles.grow}>
                  <Small bold>1 change recommended</Small>
                  <Small mini muted>
                    {waiting.title}
                  </Small>
                </View>
                <Button
                  label="Review"
                  tone={waiting.tone}
                  onPress={() =>
                    router.push({
                      pathname: "/alerts/[id]",
                      params: { id: waiting.id },
                    })
                  }
                />
              </Row>
            </Card>
          ) : null}

          <Group>
            {day.stops.map((stop) => (
              <StopLine
                key={stop.id}
                stop={stop}
                onPress={() =>
                  router.push({
                    pathname: "/trips/[id]/stop/[nodeId]",
                    params: { id, nodeId: stop.id },
                  })
                }
              />
            ))}
          </Group>

          {baseUrl ? (
            <Button
              label="Add or move stops on trip.io"
              variant="secondary"
              onPress={() => Linking.openURL(`${baseUrl}/trips/${id}`)}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 1 },
  ribbon: { gap: 6 },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 22 },
  centre: { flex: 1, alignItems: "center" },
});
