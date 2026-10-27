import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { client, messageOf, read, statusOf } from "~/api";
import { dayKeyOf, dayLabel, timeOf } from "~/format";
import { usePalette } from "~/theme";
import { type Alert, loadScreen } from "~/trip";
import {
  Body,
  Button,
  Card,
  Chip,
  Dot,
  Eyebrow,
  Heading,
  Loading,
  Notice,
  Row,
  Rule,
  Screen,
  Small,
  Stats,
  Tap,
} from "~/ui";
import { useLoad } from "~/use-load";

// What the agent has said, and a way to ask it something. The history is the
// trust screen: everything the watch told the traveller, what they did about
// it, and the count of checks behind it.

const OUTCOME = {
  accepted: "Applied",
  dismissed: "Kept plan",
  muted: "Muted",
  ignored: "No answer",
} as const;

/** "Today", "Yesterday", or the day. */
function dayName(key: string, now: number): string {
  if (key === dayKeyOf(now)) return "Today";
  if (key === dayKeyOf(now - 86_400_000)) return "Yesterday";
  return dayLabel(key);
}

export default function Agent() {
  const p = usePalette();
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadScreen(id),
  );
  const [question, setQuestion] = useState(q ?? "");
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<{
    question: string;
    text: string;
    grounded: boolean;
  } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // A question carried here from a stop goes into the box, to send or change.
  useEffect(() => {
    if (q) setQuestion(q);
  }, [q]);

  const ask = async () => {
    const asked = question.trim();
    if (asked.length < 2) return;
    setAsking(true);
    setFailure(null);
    try {
      const result = await read(
        client().trips[":id"].ask.$post({
          param: { id },
          json: { question: asked },
        }),
      );
      setAnswer({
        question: asked,
        text: result.answer,
        grounded: result.grounded,
      });
      setQuestion("");
    } catch (e) {
      setFailure(
        statusOf(e) === 503
          ? "I can’t answer questions right now. Try again in a moment."
          : messageOf(e),
      );
    } finally {
      setAsking(false);
    }
  };

  const now = Date.now();
  const alerts = data?.alerts.alerts ?? [];
  const byDay = new Map<string, Alert[]>();
  for (const alert of alerts) {
    const key = dayKeyOf(alert.sentAt);
    byDay.set(key, [...(byDay.get(key) ?? []), alert]);
  }

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset={false}>
      <View style={styles.head}>
        <Heading>Ask about your trip</Heading>
        <Card style={styles.ask}>
          <TextInput
            value={question}
            onChangeText={setQuestion}
            multiline
            maxLength={300}
            placeholder="Is there time for lunch before the hike?"
            placeholderTextColor={p.inkFaint}
            accessibilityLabel="Your question"
            style={[styles.input, { color: p.ink }]}
          />
          <Button
            label="Ask"
            busy={asking}
            disabled={question.trim().length < 2}
            onPress={ask}
          />
        </Card>
        {failure ? <Notice tone="alert">{failure}</Notice> : null}
        {answer ? (
          <Card tone="agent">
            <Small mini faint>
              {answer.question}
            </Small>
            <Body>{answer.text}</Body>
            {answer.grounded ? null : (
              <Small mini faint>
                Not from your itinerary — treat it as general advice.
              </Small>
            )}
          </Card>
        ) : null}
      </View>

      {error ? <Notice tone="alert">{error}</Notice> : null}
      {loading ? <Loading /> : null}

      {data ? (
        <>
          <View style={styles.head}>
            <Heading>Everything I have told you</Heading>
            <Eyebrow>{data.doc.trip.title}</Eyebrow>
          </View>
          <Card>
            <Stats
              tone={{ index: 1, tone: "agent" }}
              items={[
                ["Told you", String(data.alerts.told)],
                ["Applied", String(data.alerts.applied)],
                ["Kept plan", String(data.alerts.kept)],
                ["Checks run", data.alerts.checks.toLocaleString("en")],
              ]}
            />
          </Card>
          {alerts.length === 0 ? (
            <Notice tone={data.watch ? "ok" : undefined}>
              {data.watch
                ? "Nothing yet. Most days I will have nothing to say; when I do, it is here."
                : "Nothing is being watched on this trip yet."}
            </Notice>
          ) : null}
          {[...byDay.entries()].map(([key, rows]) => (
            <View key={key} style={styles.day}>
              <Rule label={dayName(key, now)} />
              {rows.map((alert) => (
                <Tap
                  key={alert.id}
                  label={alert.title}
                  onPress={() =>
                    router.push({
                      pathname: "/alerts/[id]",
                      params: { id: alert.id },
                    })
                  }
                >
                  <Card tone={alert.outcome === null ? alert.tone : undefined}>
                    <Row top gap={11}>
                      <View style={styles.mark}>
                        <Dot tone={alert.tone} />
                      </View>
                      <View style={styles.grow}>
                        <Small bold>{alert.title}</Small>
                        <Small mini muted>
                          {alert.detail}
                        </Small>
                      </View>
                      <View style={styles.end}>
                        <Small mini faint>
                          {timeOf(alert.sentAt)}
                        </Small>
                        <Chip
                          label={
                            alert.outcome === null
                              ? "Decide"
                              : OUTCOME[alert.outcome]
                          }
                          tone={
                            alert.outcome === null
                              ? alert.tone
                              : alert.outcome === "accepted"
                                ? "agent"
                                : undefined
                          }
                        />
                      </View>
                    </Row>
                  </Card>
                </Tap>
              ))}
            </View>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 8 },
  ask: { padding: 14, gap: 11 },
  input: { fontSize: 15, lineHeight: 22, minHeight: 44, padding: 0 },
  day: { gap: 8 },
  mark: { paddingTop: 6 },
  grow: { flex: 1, gap: 2 },
  end: { alignItems: "flex-end", gap: 4 },
});
