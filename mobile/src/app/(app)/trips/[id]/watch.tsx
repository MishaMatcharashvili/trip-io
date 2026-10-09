import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { client, messageOf, read, statusOf } from "~/api";
import {
  Body,
  Button,
  Card,
  Eyebrow,
  Field,
  Loading,
  Notice,
  Screen,
  SwitchRow,
  Tap,
} from "~/ui";
import { useLoad } from "~/use-load";

// What reaches the traveller on one trip, and when it may not. The same
// settings as the web screen, written through the same route: switching push
// off mid-trip is recorded there as a mute, which is a kill criterion and not
// just a preference.

type Watch = NonNullable<Awaited<ReturnType<typeof loadWatch>>>;
type Change = Parameters<typeof patchWatch>[1];

async function loadWatch(id: string) {
  try {
    const { watch } = await read(
      client().trips[":id"].watch.$get({ param: { id } }),
    );
    return watch;
  } catch (e) {
    // A trip with no stops has no watch yet.
    if (statusOf(e) === 404) return null;
    throw e;
  }
}

const patchWatch = (
  id: string,
  json: {
    channels?: ("push" | "email" | "briefing")[];
    quietHours?: { start: string; end: string } | null;
    mutedSources?: ("weather" | "road")[];
    verbosity?: "affecting" | "nearby";
  },
) => read(client().trips[":id"].watch.$patch({ param: { id }, json }));

const CHANNELS = ["push", "email", "briefing"] as const;
const SOURCE_KEYS = ["weather", "road"] as const;

/** The watch stores plain strings; the route accepts only the known ones. */
const known = <T extends string>(
  all: readonly T[],
  values: readonly string[],
) => all.filter((a) => values.includes(a));

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DEFAULT_QUIET = { start: "22:00", end: "08:00" };

const SOURCES = [
  {
    key: "weather",
    label: "Weather",
    hint: "Forecast shifts that hit an outdoor plan",
  },
  {
    key: "road",
    label: "Roads and closures",
    hint: "Only on roads you will actually drive",
  },
] as const;

export default function WatchSettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: watch, error, loading, refresh } = useLoad(() => loadWatch(id));
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // One write at a time, then the screen is what the server now holds. A
  // switch that failed to save must not keep looking switched.
  const save = async (change: Change) => {
    setSaving(true);
    setFailure(null);
    try {
      await patchWatch(id, change);
    } catch (e) {
      setFailure(messageOf(e));
    } finally {
      setSaving(false);
      refresh();
    }
  };

  if (!watch) {
    return (
      <Screen bottomInset>
        {error ? <Notice tone="alert">{error}</Notice> : null}
        {loading ? <Loading /> : null}
        {!loading && !error ? (
          <>
            <Notice>Nothing is being watched on this trip yet.</Notice>
            <Button
              label="The watch layer"
              variant="secondary"
              onPress={() =>
                router.push({ pathname: "/trips/[id]/pass", params: { id } })
              }
            />
          </>
        ) : null}
      </Screen>
    );
  }

  const has = (channel: Watch["channels"][number]) =>
    watch.channels.includes(channel);
  const toggle = (channel: "push" | "email", on: boolean) => {
    const rest = watch.channels.filter((c) => c !== channel);
    void save({ channels: known(CHANNELS, on ? [...rest, channel] : rest) });
  };

  return (
    <Screen bottomInset>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {failure ? <Notice tone="alert">{failure}</Notice> : null}

      <Eyebrow>How I reach you</Eyebrow>
      <Card style={{ gap: 14 }}>
        <SwitchRow
          label="Push"
          hint={`Only for a change inside the next two hours. At most ${watch.cap} on this trip.`}
          value={has("push")}
          disabled={saving}
          onChange={(on) => toggle("push", on)}
        />
        <SwitchRow
          label="Email"
          hint="The morning briefing, in your inbox"
          value={has("email")}
          disabled={saving}
          onChange={(on) => toggle("email", on)}
        />
        <Body faint>
          The morning briefing in the app is always on: it costs you nothing to
          receive.
        </Body>
      </Card>

      <QuietHours
        // A new key when the server's value changes, so the fields follow it.
        key={JSON.stringify(watch.quietHours)}
        quiet={watch.quietHours}
        saving={saving}
        onSave={(quietHours) => save({ quietHours })}
      />

      <Eyebrow>What I watch</Eyebrow>
      <Card style={{ gap: 14 }}>
        {SOURCES.map(({ key, label, hint }) => (
          <SwitchRow
            key={key}
            label={label}
            hint={hint}
            value={!watch.mutedSources.includes(key)}
            disabled={saving}
            onChange={(on) =>
              save({
                mutedSources: known(
                  SOURCE_KEYS,
                  on
                    ? watch.mutedSources.filter((s) => s !== key)
                    : [...watch.mutedSources, key],
                ),
              })
            }
          />
        ))}
      </Card>

      <Eyebrow>How much to tell you</Eyebrow>
      <View style={{ gap: 10 }}>
        {(
          [
            ["affecting", "Only what affects my plan", "The default."],
            [
              "nearby",
              "Anything happening nearby",
              "More findings, more noise.",
            ],
          ] as const
        ).map(([value, label, hint]) => (
          <Tap
            key={value}
            label={label}
            onPress={() =>
              watch.verbosity !== value && save({ verbosity: value })
            }
          >
            <Card tone={watch.verbosity === value ? "agent" : undefined}>
              <Body>{label}</Body>
              <Body muted>{hint}</Body>
            </Card>
          </Tap>
        ))}
      </View>
    </Screen>
  );
}

function QuietHours({
  quiet,
  saving,
  onSave,
}: {
  quiet: { start: string; end: string } | null;
  saving: boolean;
  onSave: (quiet: { start: string; end: string } | null) => void;
}) {
  const [on, setOn] = useState(quiet !== null);
  const [start, setStart] = useState((quiet ?? DEFAULT_QUIET).start);
  const [end, setEnd] = useState((quiet ?? DEFAULT_QUIET).end);
  useEffect(() => setOn(quiet !== null), [quiet]);

  const valid = CLOCK.test(start) && CLOCK.test(end);
  const changed = quiet?.start !== start || quiet?.end !== end;

  return (
    <>
      <Eyebrow>Quiet hours</Eyebrow>
      <Card style={{ gap: 14 }}>
        <SwitchRow
          label="Keep the night quiet"
          hint="Nothing wakes you in these hours. It waits for the briefing."
          value={on}
          disabled={saving}
          onChange={(next) => {
            setOn(next);
            // Switching it off is complete as it stands; switching it on waits
            // for the times to be confirmed.
            if (!next) onSave(null);
          }}
        />
        {on ? (
          <>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="From"
                  value={start}
                  onChangeText={setStart}
                  placeholder="22:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Until"
                  value={end}
                  onChangeText={setEnd}
                  placeholder="08:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            </View>
            <Body faint>24-hour, Tbilisi time.</Body>
            <Button
              label="Save quiet hours"
              variant="secondary"
              busy={saving}
              disabled={!valid || !changed}
              onPress={() => onSave({ start, end })}
            />
          </>
        ) : null}
      </Card>
    </>
  );
}
