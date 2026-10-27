import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { client, messageOf, read } from "~/api";
import { loadScreen } from "~/trip";
import {
  Body,
  Button,
  Card,
  Chip,
  Eyebrow,
  Loading,
  Notice,
  Row,
  Rule,
  Screen,
  Small,
  Stats,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

// The business model, stated plainly: planning is free, watching is bought one
// trip at a time, and a traveller's first watched trip is free. The same offer
// and the same routes as the web app's paywall.

async function loadOffer(id: string) {
  const [{ offer }, screen] = await Promise.all([
    read(client().trips[":id"].pass.$get({ param: { id } })),
    loadScreen(id),
  ]);
  return { offer, screen };
}

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);

const INCLUDED = [
  ["Continuous monitoring", "of weather and roads on your route"],
  ["Proactive alerts", "— only what touches your days"],
  ["Ready-made replans", "you apply in one tap, always revertible"],
  ["Daily briefing", "each morning, in the app and by email"],
] as const;

export default function WatchLayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadOffer(id),
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const start = async (paid: boolean) => {
    setBusy(true);
    setFailure(null);
    try {
      const pass = client().trips[":id"].pass;
      await read(
        paid
          ? pass.checkout.$post({ param: { id } })
          : pass.$post({ param: { id } }),
      );
    } catch (e) {
      setFailure(messageOf(e));
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const offer = data?.offer;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset>
      <View style={styles.head}>
        <Title>Planning is free. Watching is what you pay for.</Title>
        <Body muted>
          Build as many trips as you like. When one becomes real, turn on the
          watch layer and I follow it until you are home.
        </Body>
      </View>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {loading ? <Loading /> : null}

      {offer ? (
        <Card tone="agent" style={styles.offer}>
          <Eyebrow>The watch layer · this trip</Eyebrow>
          {offer.kind === "paid" ? (
            <Row gap={8}>
              <Title>{money(offer.cents, offer.currency)}</Title>
              <Small faint strike>
                {money(offer.listCents, offer.currency)}
              </Small>
              <Small muted>for this trip</Small>
            </Row>
          ) : offer.kind === "free" ? (
            <Title>Free for your first trip</Title>
          ) : (
            <Row>
              <Title>On</Title>
              <Chip
                tone="ok"
                dot="ok"
                label={offer.pass === "free" ? "Your free watch" : "Paid"}
              />
            </Row>
          )}
          <View style={styles.list}>
            {INCLUDED.map(([lead, rest]) => (
              <Small key={lead}>
                <Small bold>{lead}</Small> <Small muted>{rest}</Small>
              </Small>
            ))}
          </View>
          {offer.kind === "watched" ? null : (
            <Button
              label={
                offer.kind === "free"
                  ? "Turn on the watch layer"
                  : `Watch this trip · ${money(offer.cents, offer.currency)}`
              }
              busy={busy}
              onPress={() => start(offer.kind === "paid")}
            />
          )}
          {offer.kind === "paid" ? (
            <Small mini faint>
              Demo checkout: payments aren’t live yet, so nothing is charged.
            </Small>
          ) : null}
        </Card>
      ) : null}
      {failure ? <Notice tone="alert">{failure}</Notice> : null}

      <Card>
        <Row>
          <View style={styles.grow}>
            <Small bold>Free · €0 forever</Small>
            <Small mini faint>
              Unlimited trips, itinerary, versions. No monitoring.
            </Small>
          </View>
          {offer && offer.kind !== "watched" ? (
            <Chip label="Current plan" />
          ) : null}
        </Row>
      </Card>

      {data ? (
        <View style={styles.list}>
          <Rule label="On this trip so far" />
          <Stats
            items={[
              ["Checks run", data.screen.alerts.checks.toLocaleString("en")],
              ["Worth telling", String(data.screen.alerts.told)],
              ["Applied", String(data.screen.alerts.applied)],
            ]}
          />
        </View>
      ) : null}

      <Small mini faint style={styles.foot}>
        The trips you built stay yours, watched or not.
      </Small>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 7 },
  offer: { padding: 15, gap: 11 },
  list: { gap: 7 },
  grow: { flex: 1, gap: 1 },
  foot: { textAlign: "center" },
});
