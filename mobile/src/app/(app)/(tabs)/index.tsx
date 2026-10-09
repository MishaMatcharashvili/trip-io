import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { client, read } from "~/api";
import { ago, dateRange } from "~/format";
import { RouteMap } from "~/map";
import { usePalette } from "~/theme";
import {
  currentDay,
  daysOf,
  loadScreen,
  phaseOf,
  pointsOf,
  type TripScreen,
  waitingOf,
} from "~/trip";
import {
  Body,
  Button,
  Card,
  Chip,
  Dot,
  Group,
  Heading,
  Line,
  Loading,
  Notice,
  Row,
  Rule,
  Screen,
  Small,
  Tap,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

// Home. The trip under way carries its watch status and any decision still
// waiting, so the state of the product shows before anything is opened. With
// no trips at all, the only ask is a sentence.

type Trip = Awaited<ReturnType<typeof loadTrips>>["trips"][number];

async function loadTrips() {
  const { trips } = await read(client().trips.$get());
  const now = Date.now();
  // The trips under way are read whole: their cards say what is waiting.
  const live = await Promise.all(
    trips
      .filter((t) => phaseOf(t, now) === "now")
      .map(async (t) => [t.id, await loadScreen(t.id)] as const),
  );
  return { trips, live: new Map(live) };
}

/** Sentences to start from, the same three the web app offers. */
const EXAMPLES = [
  "7 days in Georgia, €700, nature and monasteries",
  "Long weekend in Kakheti with my partner",
  "Four days walking in Svaneti, moderate pace",
];

export default function Trips() {
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(loadTrips);
  const now = Date.now();
  const trips = data?.trips ?? [];
  const of = (phase: ReturnType<typeof phaseOf>) =>
    trips.filter((t) => phaseOf(t, now) === phase);
  const open = (id: string) =>
    router.push({ pathname: "/trips/[id]", params: { id } });

  if (data && trips.length === 0) return <FirstRun />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Row>
        <View style={styles.grow}>
          <Title>Your trips</Title>
        </View>
        <Chip label="+ New" tone="agent" onPress={() => router.push("/new")} />
      </Row>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {loading ? <Loading /> : null}

      {of("now").length ? (
        <View style={styles.section}>
          <Rule label="Travelling now" tone="agent" />
          {of("now").map((trip) => (
            <LiveTrip
              key={trip.id}
              trip={trip}
              screen={data?.live.get(trip.id)}
            />
          ))}
        </View>
      ) : null}

      {of("soon").length ? (
        <View style={styles.section}>
          <Rule label="Coming up" />
          <Group>
            {of("soon").map((trip) => (
              <Line
                key={trip.id}
                bold
                title={trip.title}
                detail={`${dateRange(trip.startsAt, trip.endsAt)} · ${stops(trip.stops)}`}
                trailing={<Small faint>›</Small>}
                onPress={() => open(trip.id)}
              />
            ))}
          </Group>
        </View>
      ) : null}

      {of("done").length ? (
        <View style={styles.section}>
          <Rule label="Finished" />
          <Group>
            {/* Newest first once it is over. */}
            {of("done")
              .reverse()
              .map((trip) => (
                <Line
                  key={trip.id}
                  bold
                  title={trip.title}
                  detail={`${dateRange(trip.startsAt, trip.endsAt)} · ${
                    trip.applied
                      ? `${trip.applied} ${trip.applied === 1 ? "change" : "changes"} handled`
                      : stops(trip.stops)
                  }`}
                  trailing={<Small faint>›</Small>}
                  onPress={() => open(trip.id)}
                />
              ))}
          </Group>
        </View>
      ) : null}
    </Screen>
  );
}

const stops = (n: number) => `${n} ${n === 1 ? "stop" : "stops"}`;

function LiveTrip({ trip, screen }: { trip: Trip; screen?: TripScreen }) {
  const router = useRouter();
  const days = screen ? daysOf(screen) : [];
  const day = currentDay(days);
  const waiting = screen ? waitingOf(screen) : [];
  const go = (pathname: "/trips/[id]" | "/trips/[id]/today") =>
    router.push({ pathname, params: { id: trip.id } });

  return (
    <Card style={styles.live}>
      {day ? (
        <RouteMap points={pointsOf(day.stops)} height={118} bleed={0} />
      ) : null}
      <View style={styles.liveBody}>
        <Row top gap={10}>
          <View style={styles.grow}>
            <Heading>{trip.title}</Heading>
            <Small mini faint>
              {dateRange(trip.startsAt, trip.endsAt)} · {stops(trip.stops)}
            </Small>
          </View>
          {day ? (
            <Chip label={`Day ${day.index}/${days.length}`} tone="agent" />
          ) : null}
        </Row>

        {waiting[0] ? (
          <Tap
            label={waiting[0].title}
            onPress={() =>
              router.push({
                pathname: "/alerts/[id]",
                params: { id: waiting[0].id },
              })
            }
          >
            <Card tone={waiting[0].tone} style={styles.waiting}>
              <Small bold>
                {waiting.length === 1
                  ? "1 change needs your decision"
                  : `${waiting.length} changes need your decision`}
              </Small>
              <Small mini muted>
                {waiting[0].title}
              </Small>
            </Card>
          </Tap>
        ) : null}

        <Row>
          <View style={styles.grow}>
            <Button
              label="Open today"
              onPress={() => go("/trips/[id]/today")}
            />
          </View>
          <Button
            label="Trip"
            variant="secondary"
            onPress={() => go("/trips/[id]")}
          />
        </Row>

        {screen ? (
          <Row gap={7}>
            <Dot tone={screen.watch ? "ok" : undefined} />
            <Small mini faint>
              {screen.watch
                ? `Watching${screen.lastCheck ? ` · last check ${ago(screen.lastCheck)}` : ""}`
                : "Not watched yet"}
            </Small>
          </Row>
        ) : null}
      </View>
    </Card>
  );
}

/** No trips yet: describe one, or start from an example. */
function FirstRun() {
  const p = usePalette();
  const router = useRouter();
  const [text, setText] = useState("");
  const start = (q: string) =>
    router.push({ pathname: "/new", params: q.trim() ? { q: q.trim() } : {} });

  return (
    <Screen>
      <Small bold tone="agent">
        trip.io
      </Small>
      <View style={styles.hero}>
        <Title>Where do you want to go?</Title>
        <Body muted>
          Describe it the way you would to a friend. I build the itinerary, then
          watch it for you while you travel.
        </Body>
      </View>
      <Card style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={500}
          placeholder="A week somewhere with mountains and good food, not too expensive"
          placeholderTextColor={p.inkFaint}
          accessibilityLabel="Describe your trip"
          style={[styles.prompt, { color: p.ink }]}
        />
        <Button label="Start" onPress={() => start(text)} />
      </Card>

      <View style={styles.section}>
        <Small mini faint bold>
          OR TRY ONE OF THESE
        </Small>
        <Group>
          {EXAMPLES.map((example) => (
            <Line
              key={example}
              title={example}
              trailing={<Small faint>›</Small>}
              onPress={() => start(example)}
            />
          ))}
        </Group>
      </View>

      <Notice tone="agent">
        Once a trip is live I watch weather, roads and local events along it —
        and only tell you what actually affects your days.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 3 },
  section: { gap: 9 },
  live: { padding: 0, gap: 0, overflow: "hidden" },
  liveBody: { padding: 14, gap: 11 },
  waiting: { borderRadius: 8, padding: 10, gap: 1 },
  hero: { gap: 12, paddingTop: 24 },
  composer: { padding: 15, gap: 13 },
  prompt: { fontSize: 15, lineHeight: 22, minHeight: 66, padding: 0 },
});
