import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { client, messageOf, read, statusOf } from "~/api";
import { dayLabel } from "~/format";
import { uuid } from "~/id";
import { usePalette } from "~/theme";
import {
  Body,
  Button,
  Card,
  Chip,
  Eyebrow,
  Loading,
  Notice,
  Row,
  Screen,
  Small,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

// A trip from a sentence. The traveller says what they want, the planner
// replies and keeps the request, and the cards show the request as it stands:
// what was said, what is only assumed, and what cannot be done. Nothing is
// built until the traveller asks. The same conversation as the web app's /new,
// through the same route; a correction here is made by saying it.

const loadStart = () => read(client().trips.intake.$get());

type Start = Awaited<ReturnType<typeof loadStart>>;
type State = Start["state"];
type Assessment = Start["assessment"];
type Judgement = Assessment["places"];
type Message = { role: "traveller" | "planner"; text: string };

/** Messages the traveller may send in one conversation (intake.ts). */
const MAX_TURNS = 12;
const MAX_CHARS = 500;

const INTERESTS: Record<string, string> = {
  heritage: "Heritage",
  nature: "Nature",
  culture: "Culture",
  food: "Food & wine",
};

const PACE = { relaxed: "Relaxed", moderate: "Moderate", packed: "Packed" };

export default function NewTrip() {
  const p = usePalette();
  const router = useRouter();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const start = useLoad(loadStart);

  const [messages, setMessages] = useState<Message[]>([]);
  const [state, setState] = useState<State | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (said: string, from: State) => {
    const words = said.trim().slice(0, MAX_CHARS);
    if (!words || waiting) return;
    const asked: Message[] = [...messages, { role: "traveller", text: words }];
    setText("");
    setError(null);
    setWaiting(true);
    setMessages(asked);
    try {
      const turn = await read(
        client().trips.intake.$post({ json: { state: from, messages: asked } }),
      );
      setMessages([...asked, { role: "planner", text: turn.reply }]);
      setState(turn.state);
      setAssessment(turn.assessment);
    } catch (e) {
      // Unsent: the words go back in the box rather than into a transcript
      // nobody answered.
      setMessages(messages);
      setText(words);
      setError(
        statusOf(e) === 429
          ? "That is a lot of messages. Give me a minute, then try again."
          : messageOf(e),
      );
    } finally {
      setWaiting(false);
    }
  };

  // Once, when the starting request arrives: it is the state the conversation
  // begins from, and a sentence carried here from another screen is its first
  // message. A later reload of the start must not reset a conversation.
  const begun = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arrival
  useEffect(() => {
    if (!start.data || begun.current) return;
    begun.current = true;
    setState(start.data.state);
    setAssessment(start.data.assessment);
    if (q?.trim()) void send(q, start.data.state);
  }, [start.data]);

  if (!state || !assessment || !start.data) {
    return (
      <Screen>
        {start.error ? <Notice tone="alert">{start.error}</Notice> : null}
        {start.loading ? <Loading /> : null}
      </Screen>
    );
  }

  const c = state.constraints;
  const said = (key: State["said"][number]) => state.said.includes(key);
  const nameOf = (slug: string) =>
    start.data?.destinations.find((d) => d.slug === slug)?.name ?? slug;
  const turns = messages.filter((m) => m.role === "traveller").length;
  const talkedOut = turns >= MAX_TURNS;
  const reply = messages.findLast((m) => m.role === "planner");
  const asked = messages.findLast((m) => m.role === "traveller");
  const blockers = [assessment.places, assessment.days, assessment.budget]
    .filter((j) => j.level === "impossible" && j.why)
    .map((j) => j.why as string);
  const people = c.party.adults + c.party.children;

  const build = () =>
    router.push({
      pathname: "/new/building",
      params: { c: JSON.stringify(c), r: uuid() },
    });

  return (
    <Screen bottomInset>
      <Title>Where do you want to go?</Title>

      <Card style={styles.composer}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_CHARS}
          editable={!waiting && !talkedOut}
          placeholder={
            turns === 0
              ? "7 days in Georgia, €700 budget, nature and monasteries, travelling with my father."
              : "Change anything: the dates, the places, the pace…"
          }
          placeholderTextColor={p.inkFaint}
          accessibilityLabel="Describe your trip"
          style={[styles.prompt, { color: p.ink }]}
        />
        <Button
          label={turns === 0 ? "Tell the planner" : "Send"}
          variant="secondary"
          busy={waiting}
          disabled={!text.trim() || talkedOut}
          onPress={() => send(text, state)}
        />
        {talkedOut ? (
          <Small mini faint>
            That is as long as one conversation runs. Build the trip, or start
            again.
          </Small>
        ) : null}
      </Card>
      {error ? <Notice tone="alert">{error}</Notice> : null}

      {asked ? (
        <View style={styles.turn}>
          <Small mini faint>
            You said
          </Small>
          <Body muted>{asked.text}</Body>
        </View>
      ) : null}
      {reply ? (
        <Card tone="agent">
          <Eyebrow>The planner</Eyebrow>
          <Body>{reply.text}</Body>
        </Card>
      ) : null}

      <Small bold>
        {turns === 0
          ? "What I will assume unless you say otherwise"
          : "Here is what I understood — correct anything before I build it"}
      </Small>
      <View style={styles.grid}>
        <Fact
          wide
          label="Route"
          value={c.places.map(nameOf).join(" → ")}
          assumed={!said("places")}
          judgement={assessment.places}
        />
        <Fact
          label="Length"
          value={`${c.days} ${c.days === 1 ? "day" : "days"}`}
          note={`From ${dayLabel(c.startDate)}`}
          assumed={!said("days") || !said("startDate")}
          judgement={assessment.days}
        />
        <Fact
          label="Budget"
          value={`€${c.budgetEur}`}
          note="Excl. flights"
          assumed={!said("budgetEur")}
          judgement={assessment.budget}
        />
        <Fact
          label="Interests"
          value={
            c.interests.length
              ? c.interests.map((i) => INTERESTS[i] ?? i).join(", ")
              : "A bit of everything"
          }
          assumed={!said("interests")}
        />
        <Fact
          label="Travellers"
          value={
            people === 1
              ? "Just you"
              : `${c.party.adults} adults${c.party.children ? `, ${c.party.children} children` : ""}`
          }
          note={`${PACE[c.pace]} pace`}
          assumed={!said("party")}
        />
        {c.notes ? <Fact wide label="Also" value={c.notes} /> : null}
      </View>

      {blockers.length ? (
        <Card tone="alert">
          <Small bold tone="alert">
            This trip cannot be done as asked
          </Small>
          {blockers.map((why) => (
            <Body key={why}>{why}</Body>
          ))}
        </Card>
      ) : null}

      <Button
        label="Plan my trip"
        onPress={build}
        disabled={!assessment.possible || waiting}
      />
    </Screen>
  );
}

/** One thing the request holds: its value, and how sure and how possible it is. */
function Fact({
  label,
  value,
  note,
  assumed,
  judgement,
  wide,
}: {
  label: string;
  value: string;
  note?: string;
  /** Not said by the traveller: a default they have not confirmed. */
  assumed?: boolean;
  judgement?: Judgement;
  wide?: boolean;
}) {
  const impossible = judgement?.level === "impossible";
  return (
    <Card
      tone={impossible ? "alert" : undefined}
      style={[styles.fact, wide ? styles.wide : styles.half]}
    >
      <Row>
        <View style={styles.grow}>
          <Eyebrow>{label}</Eyebrow>
        </View>
        {assumed ? <Chip label="Assumed" /> : null}
      </Row>
      <Small bold>{value}</Small>
      {note ? (
        <Small mini faint>
          {note}
        </Small>
      ) : null}
      {judgement && judgement.level !== "ok" ? (
        <Small mini tone="alert">
          {judgement.note}
        </Small>
      ) : judgement ? (
        <Small mini faint>
          {judgement.note}
        </Small>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  composer: { padding: 14, gap: 11 },
  prompt: { fontSize: 15, lineHeight: 22, minHeight: 66, padding: 0 },
  turn: { gap: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { padding: 12, gap: 3 },
  half: { flexGrow: 1, flexBasis: "45%" },
  wide: { flexBasis: "100%" },
  grow: { flex: 1 },
});
