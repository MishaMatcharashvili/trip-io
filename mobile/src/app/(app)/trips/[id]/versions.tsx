import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { bodyOf, client, messageOf, read, statusOf } from "~/api";
import { when } from "~/format";
import {
  Button,
  Card,
  Chip,
  Dot,
  Group,
  Line,
  Loading,
  Notice,
  Row,
  Rule,
  Screen,
  Small,
} from "~/ui";
import { useLoad } from "~/use-load";

// The patch log as the traveller sees it. Undo and restore add a version on
// top; nothing is ever erased.

const loadVersions = (id: string) =>
  read(client().trips[":id"].patches.$get({ param: { id } }));

const BY = {
  user: "By you",
  intervention: "Suggested · you applied",
  system: "By trip.io",
} as const;

export default function Versions() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, loading, refreshing, refresh } = useLoad(() =>
    loadVersions(id),
  );
  const [working, setWorking] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // One write at a time, then the list is what the server now holds.
  const change = async (key: string, request: () => Promise<unknown>) => {
    setWorking(key);
    setFailure(null);
    try {
      await request();
    } catch (e) {
      setFailure(
        statusOf(e) === 409 && bodyOf(e)?.error === "nothing to undo"
          ? "There is nothing left to undo."
          : statusOf(e) === 422
            ? "That version no longer fits the trip as it stands, so it can’t be restored."
            : messageOf(e),
      );
    } finally {
      setWorking(null);
      refresh();
    }
  };

  const [current, ...earlier] = data?.patches ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} bottomInset>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {failure ? <Notice tone="alert">{failure}</Notice> : null}
      {loading ? <Loading /> : null}
      {data && !current ? (
        <Notice>No changes yet: this is the trip as it was made.</Notice>
      ) : null}

      {current ? (
        <Card tone="agent" style={styles.current}>
          <Row>
            <Chip label="Current" tone="agent" />
            <Small mini faint>
              {when(current.appliedAt)}
            </Small>
          </Row>
          <Small bold>{current.intent}</Small>
          <Small mini muted>
            {BY[current.author]}
          </Small>
          {earlier.length ? (
            <Button
              label="Undo this change"
              variant="secondary"
              busy={working === "undo"}
              disabled={working !== null}
              onPress={() =>
                change("undo", () =>
                  read(client().trips[":id"].undo.$post({ param: { id } })),
                )
              }
            />
          ) : null}
        </Card>
      ) : null}

      {earlier.length ? (
        <View style={styles.section}>
          <Rule label="Earlier" />
          <Group>
            {earlier.map((patch) => (
              <Line
                key={patch.id}
                title={patch.intent}
                detail={`${when(patch.appliedAt)} · ${BY[patch.author]}`}
                leading={<Dot ring />}
                trailing={
                  <Chip
                    label={working === patch.id ? "Restoring…" : "Restore"}
                    onPress={() =>
                      working === null &&
                      change(patch.id, () =>
                        read(
                          client().trips[":id"].restore.$post({
                            param: { id },
                            json: { patchId: patch.id },
                          }),
                        ),
                      )
                    }
                  />
                }
              />
            ))}
          </Group>
        </View>
      ) : null}

      <Notice>
        Undo and restore never erase anything. They add a new version on top, so
        you can always get back to where you were.
      </Notice>
    </Screen>
  );
}

const styles = StyleSheet.create({
  current: { gap: 6 },
  section: { gap: 8 },
});
