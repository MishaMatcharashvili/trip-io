import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { client, messageOf, read } from "~/api";
import { ago, words } from "~/format";
import {
  Body,
  Button,
  Chip,
  Group,
  Line,
  Loading,
  Notice,
  Row,
  Rule,
  Screen,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

// The places the traveller kept. Any of them can start a trip, and each is
// checked again before it goes into a plan.

const loadSaved = async () => (await read(client().saved.places.$get())).places;

export default function Saved() {
  const router = useRouter();
  const { data, error, loading, refreshing, refresh } = useLoad(loadSaved);
  const [failure, setFailure] = useState<string | null>(null);

  const forget = async (placeId: string) => {
    setFailure(null);
    try {
      await read(
        client().saved.places[":placeId"].$delete({ param: { placeId } }),
      );
    } catch (e) {
      setFailure(messageOf(e));
    } finally {
      refresh();
    }
  };

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.head}>
        <Row>
          <View style={styles.grow}>
            <Title>Saved</Title>
          </View>
          <Chip label="Explore" onPress={() => router.push("/explore")} />
        </Row>
        <Body muted>
          Anything here can start a trip — I re-check each one before it goes
          into a plan.
        </Body>
      </View>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {failure ? <Notice tone="alert">{failure}</Notice> : null}
      {loading ? <Loading /> : null}

      {data && data.length === 0 ? (
        <>
          <Notice>
            Nothing kept yet. Save a place on Explore and it waits here.
          </Notice>
          <Button
            label="Explore Georgia"
            variant="secondary"
            onPress={() => router.push("/explore")}
          />
        </>
      ) : null}

      {data?.length ? (
        <View style={styles.section}>
          <Rule label={`Places · ${data.length}`} />
          <Group>
            {data.map((place) => (
              <Line
                key={place.id}
                bold
                title={place.name}
                detail={`${words(place.category)} · saved ${ago(place.savedAt)}`}
                trailing={
                  <Row gap={6}>
                    <Chip
                      label="Plan around it"
                      tone="agent"
                      onPress={() =>
                        router.push({
                          pathname: "/new",
                          params: { q: `A trip that includes ${place.name}` },
                        })
                      }
                    />
                    <Chip label="Remove" onPress={() => forget(place.id)} />
                  </Row>
                }
              />
            ))}
          </Group>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4 },
  grow: { flex: 1 },
  section: { gap: 8 },
});
