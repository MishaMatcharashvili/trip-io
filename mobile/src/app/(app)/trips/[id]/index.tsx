import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, View } from "react-native";
import { client, read } from "~/api";
import { baseUrl } from "~/config";
import { ago, dateRange, dayKeyOf, dayLabel, timeOf } from "~/format";
import {
  Body,
  Button,
  Card,
  Eyebrow,
  Heading,
  Loading,
  Notice,
  Pill,
  Screen,
  Tap,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

async function loadTrip(id: string) {
  const [view, alerts] = await Promise.all([
    read(client().trips[":id"].$get({ param: { id } })),
    read(client().trips[":id"].alerts.$get({ param: { id } })),
  ]);
  return { view, alerts };
}

type Loaded = Awaited<ReturnType<typeof loadTrip>>;
type Alert = Loaded["alerts"]["alerts"][number];

/** The days of the trip, each with its stops in time order. */
function daysOf(nodes: Loaded["view"]["doc"]["nodes"]) {
  const byDay = new Map<string, { id: string; at: string; title: string }[]>();
  for (const [id, node] of Object.entries(nodes)) {
    const key = dayKeyOf(node.startsAt);
    byDay.set(key, [
      ...(byDay.get(key) ?? []),
      { id, at: node.startsAt, title: node.meta.title },
    ]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, stops]) => ({
      key,
      stops: stops.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    }));
}

export default function TripScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadTrip(id),
  );

  const header = data?.view.doc.trip;
  // A card still waiting for its answer. The server reports the channel and
  // the outcome; only an unanswered one is a decision.
  const waiting = data?.alerts.alerts.filter((a) => a.outcome === null) ?? [];
  const past = data?.alerts.alerts.filter((a) => a.outcome !== null) ?? [];

  const openAlert = (alert: Alert) =>
    router.push({ pathname: "/alerts/[id]", params: { id: alert.id } });

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset>
      <Stack.Screen options={{ title: header?.title ?? "" }} />
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {loading ? <Loading /> : null}

      {header && data ? (
        <>
          <View style={{ gap: 4 }}>
            <Title>{header.title}</Title>
            <Body muted>{dateRange(header.startsAt, header.endsAt)}</Body>
          </View>

          {waiting.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Eyebrow>Needs your decision</Eyebrow>
              {waiting.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onPress={openAlert} />
              ))}
            </View>
          ) : (
            <Notice tone="ok">Nothing needs your decision right now.</Notice>
          )}

          <View style={{ gap: 10 }}>
            <Eyebrow>Your days</Eyebrow>
            {daysOf(data.view.doc.nodes).map((day) => (
              <Card key={day.key}>
                <Heading>{dayLabel(day.key)}</Heading>
                {day.stops.map((stop) => (
                  <Body key={stop.id}>
                    <Body muted>{timeOf(stop.at)}</Body>
                    {"  "}
                    {stop.title}
                  </Body>
                ))}
              </Card>
            ))}
          </View>

          {past.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Eyebrow>
                Everything I have told you · {data.alerts.told} told,{" "}
                {data.alerts.applied} applied
              </Eyebrow>
              {past.map((alert) => (
                <AlertCard key={alert.id} alert={alert} onPress={openAlert} />
              ))}
            </View>
          ) : null}

          <Button
            label="Notifications and quiet hours"
            variant="secondary"
            onPress={() =>
              router.push({
                pathname: "/trips/[id]/watch",
                params: { id },
              })
            }
          />
          {baseUrl ? (
            <Button
              label="Open the map and edit on trip.io"
              variant="quiet"
              onPress={() => Linking.openURL(`${baseUrl}/trips/${id}`)}
            />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const OUTCOME = {
  accepted: "Applied",
  dismissed: "Kept your plan",
  muted: "Muted",
  ignored: "No answer",
} as const;

function AlertCard({
  alert,
  onPress,
}: {
  alert: Alert;
  onPress: (alert: Alert) => void;
}) {
  return (
    <Tap label={alert.title} onPress={() => onPress(alert)}>
      <Card tone={alert.outcome === null ? alert.tone : undefined}>
        <Heading>{alert.title}</Heading>
        <Body muted>{alert.detail}</Body>
        <Body faint>
          {ago(alert.sentAt)}
          {alert.outcome === null ? "" : ` · ${OUTCOME[alert.outcome]}`}
        </Body>
        {alert.outcome === null ? <Pill tone={alert.tone}>Decide</Pill> : null}
      </Card>
    </Tap>
  );
}
