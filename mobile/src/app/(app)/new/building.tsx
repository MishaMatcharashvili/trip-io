import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { bodyOf, client, messageOf, read, statusOf } from "~/api";
import { usePalette } from "~/theme";
import {
  Body,
  Button,
  Card,
  Eyebrow,
  Heading,
  Notice,
  Row,
  Screen,
  Small,
} from "~/ui";

// The build: about a minute, one request. It is asked for under the id the
// planner screen minted, so coming back to this screen, or asking twice, is
// the same build and never a second trip. While another call holds the
// request this one waits and asks where it stands.

type Constraints = Parameters<
  ReturnType<typeof client>["trips"]["generate"]["$post"]
>[0]["json"];

const POLL_MS = 3000;

/** What is being done, in the order it is done. Not a progress report. */
const STEPS = [
  ["Shaping the days around the places you named", "Driving kept short"],
  ["Choosing places against your budget", "From the catalogue I have checked"],
  ["Checking opening hours and seasonal closures", "Day by day"],
  ["Validating each day as a whole", "No overlaps, nothing shut on arrival"],
];

type Outcome =
  | { kind: "building" }
  | { kind: "refused"; reasons: string[] }
  | { kind: "failed"; message: string }
  | { kind: "cancelled" };

export default function Building() {
  const p = usePalette();
  const router = useRouter();
  const { c, r } = useLocalSearchParams<{ c: string; r: string }>();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "building" });
  const [cancelling, setCancelling] = useState(false);
  const alive = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: one build per arrival
  useEffect(() => {
    alive.current = true;
    const done = (id: string) =>
      alive.current &&
      router.replace({ pathname: "/trips/[id]", params: { id } });
    const settle = (next: Outcome) => alive.current && setOutcome(next);

    /** Another call is composing it: wait for where it ends up. */
    const wait = async () => {
      while (alive.current) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        const state = await read(
          client().trips.generate[":requestId"].$get({
            param: { requestId: r },
          }),
        );
        if (state.status === "done") return done(state.tripId);
        if (state.status !== "pending") return settle({ kind: "cancelled" });
      }
    };

    (async () => {
      try {
        const wanted = JSON.parse(c) as Constraints;
        const response = await client().trips.generate.$post({
          json: { ...wanted, requestId: r },
        });
        if (response.status === 202) return await wait();
        const built = await read(response);
        if ("id" in built) done(built.id);
      } catch (e) {
        const status = statusOf(e);
        const body = bodyOf(e) as {
          error?: string;
          explanations?: string[];
        } | null;
        if (status === 409) return settle({ kind: "cancelled" });
        if (status === 422 && body?.explanations?.length) {
          return settle({ kind: "refused", reasons: body.explanations });
        }
        settle({ kind: "failed", message: messageOf(e) });
      }
    })();

    return () => {
      alive.current = false;
    };
  }, [c, r]);

  const cancel = async () => {
    setCancelling(true);
    try {
      await read(
        client().trips.generate[":requestId"].cancel.$post({
          param: { requestId: r },
        }),
      );
    } catch {
      // Leaving is what was asked for, whether or not the server heard.
    }
    router.back();
  };

  if (outcome.kind !== "building") {
    return (
      <Screen>
        <Heading>
          {outcome.kind === "refused"
            ? "I could not build that trip"
            : outcome.kind === "cancelled"
              ? "The build was called off"
              : "The build did not finish"}
        </Heading>
        {outcome.kind === "refused" ? (
          <Card tone="alert">
            {outcome.reasons.map((reason) => (
              <Body key={reason}>{reason}</Body>
            ))}
          </Card>
        ) : null}
        {outcome.kind === "failed" ? (
          <Notice tone="alert">{outcome.message}</Notice>
        ) : null}
        {outcome.kind === "cancelled" ? (
          <Notice>
            Nothing was saved. Your request is still as you left it.
          </Notice>
        ) : null}
        <Button label="Back to the request" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Row>
        <View style={styles.grow}>
          <Small bold tone="agent">
            trip.io
          </Small>
        </View>
        <Button
          label="Cancel"
          variant="quiet"
          busy={cancelling}
          onPress={cancel}
        />
      </Row>
      <Card style={styles.card}>
        <Eyebrow>Building your trip</Eyebrow>
        <Heading>Putting your days together</Heading>
        <Small mini muted>
          About a minute. Leaving this screen does not stop it: the trip appears
          in your list when it is done.
        </Small>
        <Row gap={10}>
          <ActivityIndicator color={p.agent} />
          <Small tone="agent">Working on it</Small>
        </Row>
        <View style={styles.steps}>
          {STEPS.map(([title, note]) => (
            <View key={title} style={styles.step}>
              <Small bold>{title}</Small>
              <Small mini faint>
                {note}
              </Small>
            </View>
          ))}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  card: { padding: 16, gap: 12 },
  steps: { gap: 10 },
  step: { gap: 1 },
});
