import { useRouter } from "expo-router";
import { View } from "react-native";
import { client, read } from "~/api";
import { dateRange } from "~/format";
import {
  Body,
  Card,
  Eyebrow,
  Heading,
  Loading,
  Notice,
  Screen,
  Tap,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

type Trip = Awaited<ReturnType<typeof loadTrips>>[number];

async function loadTrips() {
  const { trips } = await read(client().trips.$get());
  return trips;
}

/** Where a trip stands against the clock: the list groups by it. */
function phase(trip: Trip, now: number): "now" | "soon" | "done" {
  if (Date.parse(trip.endsAt) < now) return "done";
  return Date.parse(trip.startsAt) <= now ? "now" : "soon";
}

export default function Trips() {
  const { data, error, loading, refreshing, refresh } = useLoad(loadTrips);
  const now = Date.now();

  const groups = [
    { key: "now", label: "Travelling now" },
    { key: "soon", label: "Coming up" },
    { key: "done", label: "Finished" },
  ] as const;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Title>Your trips</Title>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {loading ? <Loading /> : null}
      {data && data.length === 0 ? (
        <Notice>
          No trips yet. Plan one on trip.io in your browser, and it appears here
          for you to follow.
        </Notice>
      ) : null}
      {groups.map(({ key, label }) => {
        const trips = (data ?? []).filter((t) => phase(t, now) === key);
        // Newest first once it is over; soonest first before that.
        if (key === "done") trips.reverse();
        return trips.length ? (
          <View key={key} style={{ gap: 10 }}>
            <Eyebrow>{label}</Eyebrow>
            {trips.map((trip) => (
              <TripRow key={trip.id} trip={trip} />
            ))}
          </View>
        ) : null;
      })}
    </Screen>
  );
}

function TripRow({ trip }: { trip: Trip }) {
  const router = useRouter();
  return (
    <Tap
      label={trip.title}
      onPress={() =>
        router.push({ pathname: "/trips/[id]", params: { id: trip.id } })
      }
    >
      <Card>
        <Heading>{trip.title}</Heading>
        <Body muted>
          {dateRange(trip.startsAt, trip.endsAt)} · {trip.stops}{" "}
          {trip.stops === 1 ? "stop" : "stops"}
          {trip.applied > 0
            ? ` · ${trip.applied} ${trip.applied === 1 ? "change" : "changes"} handled`
            : ""}
        </Body>
      </Card>
    </Tap>
  );
}
