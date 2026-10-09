import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { client, messageOf, read } from "~/api";
import { ago, timeOf } from "~/format";
import { Chevron } from "~/icon";
import { RouteMap } from "~/map";
import { StopLine } from "~/stops";
import {
  currentDay,
  daysOf,
  loadScreen,
  pointsOf,
  type TripScreen,
  waitingOf,
  watchStrip,
} from "~/trip";
import {
  Body,
  Button,
  Card,
  Chip,
  Dot,
  Eyebrow,
  Group,
  Heading,
  Line,
  Loading,
  Notice,
  Row,
  Screen,
  Small,
} from "~/ui";
import { useLoad } from "~/use-load";

// The trip under way. The map is the canvas; over it, the one thing the watch
// has to say, in one of its states: a change waiting for a decision, a day
// just updated, nothing to report, or — when the server cannot be reached —
// paused, with everything below marked as last known rather than current.

/** How long an applied change can still be undone (the web card's promise). */
const UNDO_MS = 24 * 60 * 60 * 1000;

/** What a patch moved: "16:00 Hike → 11:30 Hike", one row per stop. */
function movedRows(screen: TripScreen) {
  if (!screen.before) return [];
  return Object.entries(screen.doc.nodes).flatMap(([nodeId, node]) => {
    const was = screen.before?.nodes[nodeId];
    if (!was || was.startsAt === node.startsAt) return [];
    return [
      {
        nodeId,
        from: `${timeOf(was.startsAt)} ${was.meta.title}`,
        to: `${timeOf(node.startsAt)} ${node.meta.title}`,
      },
    ];
  });
}

export default function TripMap() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadScreen(id),
  );
  const [undoing, setUndoing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // When what is on screen was read: what "last known" means once a reload
  // has failed.
  const [readAt, setReadAt] = useState<number | null>(null);
  useEffect(() => {
    if (data) setReadAt(Date.now());
  }, [data]);

  if (!data) {
    return (
      <Screen>
        {error ? <Notice tone="alert">{error}</Notice> : null}
        {loading ? <Loading /> : null}
      </Screen>
    );
  }

  const days = daysOf(data);
  const day = currentDay(days);
  const paused = Boolean(error);
  const waiting = waitingOf(data)[0];
  const head = data.history[0];
  const updated =
    head &&
    head.author === "intervention" &&
    Date.now() - Date.parse(head.appliedAt) < UNDO_MS
      ? head
      : null;
  const moved = updated ? movedRows(data) : [];
  const upcoming = day?.stops.filter((s) => s.state !== "done") ?? [];
  const done = (day?.stops.length ?? 0) - upcoming.length;
  const openStop = (nodeId: string) =>
    router.push({
      pathname: "/trips/[id]/stop/[nodeId]",
      params: { id, nodeId },
    });

  const undo = async () => {
    setUndoing(true);
    setFailure(null);
    try {
      await read(client().trips[":id"].undo.$post({ param: { id } }));
    } catch (e) {
      setFailure(messageOf(e));
    } finally {
      setUndoing(false);
      refresh();
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset={false}>
      {day ? (
        <RouteMap
          points={pointsOf(day.stops)}
          height={220}
          alert={Boolean(waiting && waiting.tone === "alert")}
          dim={paused}
        />
      ) : null}

      <Row>
        <View style={styles.grow}>
          <Small bold>
            {data.doc.trip.title}
            {day ? ` · Day ${day.index}` : ""}
          </Small>
          {day ? <Eyebrow>{day.summary}</Eyebrow> : null}
        </View>
        <Chip
          dot={paused || !data.watch ? "idle" : "ok"}
          label={paused ? "Paused" : data.watch ? "Watching" : "Not watched"}
        />
      </Row>

      {paused ? (
        <Card style={styles.state}>
          <Eyebrow>Watch layer paused</Eyebrow>
          <Heading>
            I can’t reach trip.io
            {readAt ? ` since ${timeOf(new Date(readAt).toISOString())}` : ""}
          </Heading>
          <Body muted>
            Your itinerary is all here, but I can’t see weather or roads until
            you’re back online — treat everything below as last known, not
            current.
          </Body>
          <Button label="Try again" onPress={refresh} busy={refreshing} />
        </Card>
      ) : waiting ? (
        <Card tone={waiting.tone} style={styles.state}>
          <Eyebrow>
            {waiting.tone === "alert"
              ? "A change on your route"
              : "Something better came up"}
          </Eyebrow>
          <Heading>{waiting.title}</Heading>
          <Body muted>{waiting.detail}</Body>
          <Button
            label={waiting.tone === "alert" ? "Replan my day" : "See it"}
            tone={waiting.tone}
            onPress={() =>
              router.push({
                pathname: "/alerts/[id]",
                params: { id: waiting.id },
              })
            }
          />
        </Card>
      ) : updated ? (
        <Card tone="ok" style={styles.state}>
          <Eyebrow>
            Day updated · {moved.length || 1}{" "}
            {moved.length === 1 || !moved.length ? "change" : "changes"} applied
          </Eyebrow>
          <Heading>{updated.intent}</Heading>
          {moved.map((row) => (
            <Row key={row.nodeId} gap={10}>
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
          <Row>
            <View style={styles.grow}>
              <Small bold>Changed your mind?</Small>
              <Small mini faint>
                Applied {ago(updated.appliedAt)} · undo for 24 hours
              </Small>
            </View>
            <Button
              label="Undo"
              variant="secondary"
              busy={undoing}
              onPress={undo}
            />
          </Row>
        </Card>
      ) : data.watch ? (
        <Card tone="ok" style={styles.state}>
          <Row>
            <View style={styles.grow}>
              <Eyebrow>Nothing needs you</Eyebrow>
            </View>
            {data.lastCheck ? (
              <Small mini faint>
                Checked {ago(data.lastCheck)}
              </Small>
            ) : null}
          </Row>
          <Heading>All clear for the rest of today</Heading>
          <Body muted>
            Weather and roads along your route all hold. If that changes, I will
            tell you — you don’t need to check.
          </Body>
          <Row gap={6}>
            {watchStrip(data).map((cell) => (
              <View key={cell.name} style={styles.cell}>
                <Row gap={5}>
                  <Dot tone={cell.count ? "alert" : "ok"} />
                  <Small mini bold>
                    {cell.name}
                  </Small>
                </Row>
                <Small mini faint>
                  {cell.count ? `${cell.count} new` : "Clear"}
                </Small>
              </View>
            ))}
          </Row>
        </Card>
      ) : (
        <Card style={styles.state}>
          <Eyebrow>Not watched yet</Eyebrow>
          <Body muted>
            This trip is a plan, not a watched trip. Turn on the watch layer and
            I follow it until you are home.
          </Body>
          <Button
            label="The watch layer"
            variant="secondary"
            onPress={() =>
              router.push({ pathname: "/trips/[id]/pass", params: { id } })
            }
          />
        </Card>
      )}
      {failure ? <Notice tone="alert">{failure}</Notice> : null}

      {day && upcoming.length ? (
        <View style={styles.section}>
          <Eyebrow>
            {paused && readAt
              ? `Your plan, as of ${timeOf(new Date(readAt).toISOString())}`
              : upcoming[0].state === "now"
                ? "Now"
                : "Next"}
          </Eyebrow>
          <Group>
            {upcoming.slice(0, 3).map((stop) => (
              <StopLine
                key={stop.id}
                stop={stop}
                onPress={() => openStop(stop.id)}
              />
            ))}
          </Group>
          <Row>
            <Chip label={`${done} done`} />
            <Chip label={`${upcoming.length} left today`} />
            <View style={styles.grow} />
            <Chip
              label="Expand itinerary"
              tone="agent"
              onPress={() =>
                router.push({
                  pathname: "/trips/[id]/day/[date]",
                  params: { id, date: day.key },
                })
              }
            />
          </Row>
        </View>
      ) : day ? (
        <Notice>Nothing left on the plan for this day.</Notice>
      ) : (
        <Notice>This trip has no stops yet.</Notice>
      )}

      <Group>
        <Line
          title="Ask about your trip"
          detail="Answered from your itinerary"
          trailing={<Chevron />}
          onPress={() =>
            router.push({ pathname: "/trips/[id]/ai", params: { id } })
          }
        />
      </Group>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 1 },
  state: { gap: 10 },
  cell: { flex: 1, gap: 3 },
  section: { gap: 8 },
});
