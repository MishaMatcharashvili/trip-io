import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { bodyOf, client, messageOf, read } from "~/api";
import { timeOf } from "~/format";
import {
  Body,
  Button,
  Card,
  Eyebrow,
  Hairline,
  Heading,
  Loading,
  Notice,
  Pill,
  Screen,
  Title,
} from "~/ui";
import { useLoad } from "~/use-load";

// The intervention card: one thing the watch noticed, and one decision. It
// answers the same three questions in the same order as the web card — what
// changed, what it affects, what I suggest — then every stop the change would
// move, because the traveller accepts or rejects all of it as one unit. The
// evidence sits under the buttons, never hidden.

type Answer = "accept" | "dismiss" | "mute";

const OUTCOME = {
  accepted: "Applied",
  dismissed: "You kept your plan",
  muted: "Muted — no more interrupts on this trip",
  ignored: "No answer yet",
} as const;

/** Why an answer was refused, in the words the web card uses. */
const REFUSALS: Record<string, string> = {
  "already-answered": "This was already answered on another device.",
  "no-longer-applies":
    "Your plan has changed since this was suggested, so it can’t be applied as it was.",
  "nothing-to-apply": "There’s nothing to apply here.",
};

export default function InterventionCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    data: card,
    error,
    loading,
    refresh,
  } = useLoad(() =>
    read(client().interventions[":id"].$get({ param: { id } })),
  );
  const [sending, setSending] = useState<Answer | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  // Each answer is one request that either records the outcome or says why it
  // could not — then the card is read again, because its truth is the database
  // row, not this screen's memory of having been tapped.
  const send = async (answer: Answer) => {
    setSending(answer);
    setRefusal(null);
    try {
      await read(
        client().interventions[":id"][":answer"].$post({
          param: { id, answer },
        }),
      );
    } catch (e) {
      const body = bodyOf(e);
      setRefusal(
        body?.messages?.[0] ?? REFUSALS[body?.error ?? ""] ?? messageOf(e),
      );
    } finally {
      setSending(null);
      refresh();
    }
  };

  if (!card) {
    return (
      <Screen bottomInset>
        {error ? <Notice tone="alert">{error}</Notice> : null}
        {loading ? <Loading /> : null}
      </Screen>
    );
  }

  const disruption = card.tone === "alert";
  const answered =
    card.outcome !== null && card.outcome !== "ignored" ? card.outcome : null;
  const canApply =
    card.canAnswer &&
    card.rows !== null &&
    card.rows.length > 0 &&
    !card.blocked;
  const suggestion =
    card.suggestion ??
    (card.rows?.length
      ? card.rows.length === 1
        ? "One change to your day."
        : `${card.rows.length} changes to your day, made together.`
      : "Nothing needs to move — this is worth knowing.");

  return (
    <Screen bottomInset>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <Eyebrow>{card.kind}</Eyebrow>
          {card.outcome ? (
            <Pill tone={card.outcome === "accepted" ? "agent" : "ok"}>
              {OUTCOME[card.outcome]}
            </Pill>
          ) : null}
        </View>
        <Title>{card.headline}</Title>
        {card.sentAt ? <Body faint>{timeOf(card.sentAt)}</Body> : null}
      </View>

      {error ? <Notice tone="alert">{error}</Notice> : null}

      <Card tone={disruption ? "alert" : "agent"} style={{ gap: 12 }}>
        <Fact label="Changed" text={card.changed} />
        <Hairline />
        <Fact label="Affects" text={card.affects} />
        <Hairline />
        <Fact
          label={answered === "accepted" ? "I did" : "I suggest"}
          text={suggestion}
        />
      </Card>

      {card.rows?.length ? (
        <View style={{ gap: 8 }}>
          <Eyebrow>
            {answered === "accepted" ? "Applied" : "With the change"}
          </Eyebrow>
          {card.rows.map((row) => (
            <Card key={row.nodeId}>
              <Body faint style={{ textDecorationLine: "line-through" }}>
                {row.from}
              </Body>
              <Heading>{row.to}</Heading>
            </Card>
          ))}
        </View>
      ) : null}

      {card.blocked && !answered ? (
        <Notice>This can’t be applied as things stand: {card.blocked}</Notice>
      ) : null}

      {card.canAnswer ? (
        <View style={{ gap: 10 }}>
          {canApply ? (
            <Button
              label="Apply change"
              tone={disruption ? "alert" : "agent"}
              busy={sending === "accept"}
              disabled={sending !== null}
              onPress={() => send("accept")}
            />
          ) : null}
          <Button
            label="Keep current plan"
            variant="secondary"
            busy={sending === "dismiss"}
            disabled={sending !== null}
            onPress={() => send("dismiss")}
          />
          {/* Only a push can be muted: the briefing is the channel that stays. */}
          {card.channel === "push" ? (
            <Button
              label="Don’t interrupt me on this trip"
              variant="quiet"
              busy={sending === "mute"}
              disabled={sending !== null}
              onPress={() => send("mute")}
            />
          ) : null}
        </View>
      ) : null}
      {refusal ? <Notice tone="alert">{refusal}</Notice> : null}

      <Body faint>{card.evidence}</Body>
    </Screen>
  );
}

function Fact({ label, text }: { label: string; text: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Eyebrow>{label}</Eyebrow>
      <Body>{text}</Body>
    </View>
  );
}
