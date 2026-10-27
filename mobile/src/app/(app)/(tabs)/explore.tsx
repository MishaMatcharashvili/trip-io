import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { client, messageOf, read } from "~/api";
import { words } from "~/format";
import { RouteMap } from "~/map";
import { usePalette } from "~/theme";
import {
  Chip,
  Dot,
  Eyebrow,
  Group,
  Heading,
  Line,
  Loading,
  Notice,
  Row,
  Rule,
  Screen,
  Small,
} from "~/ui";
import { useLoad } from "~/use-load";

// The catalogue before there is a trip: the regions, what each holds, and
// what the season says about the roads to them. A place kept here is on the
// Saved tab, and can start a trip.

type Overview = Awaited<ReturnType<typeof loadOverview>>;
type Area = Overview["areas"][number]["slug"];

/** What the filters are called (src/features/explore-model.ts). */
const GROUPS = [
  ["heritage", "Heritage"],
  ["nature", "Nature"],
  ["food", "Food & wine"],
  ["culture", "Culture"],
  ["lodging", "Stay"],
] as const;
type Kind = (typeof GROUPS)[number][0];

const loadOverview = () => read(client().places.overview.$get());

async function loadPlaces(area: Area | null, group: Kind | null, q: string) {
  const [{ places }, { placeIds }] = await Promise.all([
    read(
      client().places.$get({
        query: {
          ...(area ? { area } : {}),
          ...(group ? { group } : {}),
          ...(q ? { q } : {}),
          limit: "30",
        },
      }),
    ),
    read(client().saved.$get()),
  ]);
  return { places, saved: new Set(placeIds) };
}

const TIER: Record<string, string> = {
  curated: "Checked by hand",
  verified: "Verified listing",
};

export default function Explore() {
  const p = usePalette();
  const router = useRouter();
  const [area, setArea] = useState<Area | null>(null);
  const [group, setGroup] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const overview = useLoad(loadOverview);
  const list = useLoad(() => loadPlaces(area, group, q));
  // The filters are not the screen's focus: a change reads again by hand.
  const choose = <T,>(set: (value: T) => void, value: T) => {
    set(value);
    list.refresh();
  };

  const keep = async (placeId: string, saved: boolean) => {
    setFailure(null);
    try {
      const at = client().saved.places[":placeId"];
      await read(
        saved
          ? at.$delete({ param: { placeId } })
          : at.$put({ param: { placeId } }),
      );
    } catch (e) {
      setFailure(messageOf(e));
    } finally {
      list.refresh();
    }
  };

  const roads = (overview.data?.roads ?? [])
    .filter((r) =>
      area ? (r.areas as string[]).includes(area) : r.tone === "alert",
    )
    // The hazards first.
    .sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "alert" ? -1 : 1));
  const places = list.data?.places ?? [];

  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <RouteMap points={places.map((place) => place.lonLat)} pins />
      <View
        style={[
          styles.search,
          { backgroundColor: p.surface, borderColor: p.hairlineStrong },
        ]}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => choose(setQ, text.trim())}
          returnKeyType="search"
          placeholder="Search places"
          placeholderTextColor={p.inkFaint}
          accessibilityLabel="Search places"
          style={[styles.searchInput, { color: p.ink }]}
        />
        {q ? (
          <Chip
            label="Clear"
            onPress={() => {
              setText("");
              choose(setQ, "");
            }}
          />
        ) : null}
      </View>

      <View style={styles.head}>
        <Eyebrow>Explore Georgia</Eyebrow>
        <Heading>Places I have checked by hand</Heading>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row gap={6}>
          {(overview.data?.areas ?? []).map((a) => (
            <Chip
              key={a.slug}
              label={`${a.name} · ${a.curated + a.verified}`}
              on={area === a.slug}
              onPress={() => choose(setArea, area === a.slug ? null : a.slug)}
            />
          ))}
        </Row>
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row gap={6}>
          <Chip
            label="All"
            on={!group}
            onPress={() => choose(setGroup, null)}
          />
          {GROUPS.map(([key, label]) => (
            <Chip
              key={key}
              label={label}
              on={group === key}
              onPress={() => choose(setGroup, key)}
            />
          ))}
        </Row>
      </ScrollView>

      {overview.error ? <Notice tone="alert">{overview.error}</Notice> : null}
      {list.error ? <Notice tone="alert">{list.error}</Notice> : null}
      {failure ? <Notice tone="alert">{failure}</Notice> : null}
      {list.loading ? <Loading /> : null}

      {list.data && places.length === 0 ? (
        <Notice>Nothing here matches that. Try another region or word.</Notice>
      ) : null}
      {places.length ? (
        <Group>
          {places.map((place) => {
            const saved = list.data?.saved.has(place.id) ?? false;
            return (
              <Line
                key={place.id}
                bold
                title={place.name}
                detail={[
                  words(place.category),
                  place.outdoor ? "Outdoors" : null,
                  TIER[place.tier] ?? null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <Chip
                    label={saved ? "Saved" : "Save"}
                    tone={saved ? "agent" : undefined}
                    onPress={() => keep(place.id, saved)}
                  />
                }
              />
            );
          })}
        </Group>
      ) : null}

      {overview.data ? (
        <View style={styles.head}>
          <Rule
            label={`Before you plan · roads in ${overview.data.monthName}`}
          />
          <Group>
            {roads.length === 0 ? (
              <Line title="No seasonal hazard on the roads this month." />
            ) : (
              roads.map((road) => (
                <Line
                  key={road.slug}
                  title={road.name}
                  detail={road.status}
                  detailTone={road.tone === "alert" ? "alert" : undefined}
                  leading={<Dot tone={road.tone} />}
                />
              ))
            )}
          </Group>
          <Small mini faint>
            The usual season, not today’s road. A watched trip gets the live
            reports.
          </Small>
        </View>
      ) : null}

      <Chip
        label="Plan a trip from a sentence"
        tone="agent"
        onPress={() => router.push("/new")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 13,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8 },
  head: { gap: 8 },
});
