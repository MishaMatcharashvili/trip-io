"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Constraints } from "@/domain/trip/generate/constraints";
import { assessAsked, reasons } from "@/domain/trip/generate/feasibility";
import {
  applyEdit,
  INTAKE_MAX_CHARS,
  INTAKE_MAX_TURNS,
  type IntakeMessage,
  type IntakeOption,
  type IntakeState,
  initialState,
} from "@/domain/trip/generate/intake";
import { sketchTrip } from "@/domain/trip/generate/sketch";
import { withGuestSession } from "@/lib/guest-session";
import { apiClient } from "@/lib/hono-client";
import { Button, QuietAction } from "@/ui/button";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { Eyebrow } from "@/ui/text";
import { ConstraintCards } from "./constraint-cards";
import {
  type Conversation,
  conversation as conversationSchema,
  encodeConstraints,
  forgetConversation,
  PLANNER_STORAGE_KEY,
  turnReply,
} from "./new-trip";
import { OptionCards, TripSketchCard } from "./planner-cards";

// The conversation on /new. The traveller writes, the planner replies
// (src/bll/intake.ts), and along the way it puts cards down: the choices it
// offers, under the message that offers them, and the trip as it stands so
// far, in numbers. Sending a message never builds anything: the day-by-day
// plan is built by the one button on the sketch, and only by it — and not at
// all while the trip is red: a trip that cannot be done is explained, not
// attempted.

const OPENING =
  "Tell me about the trip you have in mind: where in Georgia, how long, who is coming and what you enjoy. I will work it out with you, and nothing is built until you say so.";

/** The tab's conversation, if it kept one this page can still read. */
function restore(): Conversation | null {
  try {
    const raw = sessionStorage.getItem(PLANNER_STORAGE_KEY);
    return raw
      ? (conversationSchema.safeParse(JSON.parse(raw)).data ?? null)
      : null;
  } catch {
    return null;
  }
}

function keep(conversation: Conversation) {
  try {
    sessionStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(conversation));
  } catch {
    // Without storage the conversation simply does not survive leaving the page.
  }
}

async function takeTurn(state: IntakeState, messages: IntakeMessage[]) {
  const res = await withGuestSession(() =>
    apiClient.api.trips.intake.$post({ json: { state, messages } }),
  );
  if ((res.status as number) === 429) {
    throw new Error(
      "That is a lot of messages in a short while. Give it a minute, or build from the cards.",
    );
  }
  const body = turnReply.safeParse(await res.json().catch(() => null));
  if (!res.ok || !body.success) {
    throw new Error("I couldn’t reply just now. Try sending that again.");
  }
  return body.data;
}

export function TripPlanner({
  today,
  initial,
  examples,
}: {
  /** YYYY-MM-DD in Tbilisi, from the server so both sides agree. */
  today: string;
  /** A first message carried here from the landing page. */
  initial?: string;
  examples: string[];
}) {
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation>(() => ({
    messages: [],
    state: initialState(today),
    ready: false,
  }));
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The cards to correct the request by hand, under the sketch. */
  const [details, setDetails] = useState(false);
  const started = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  const { messages, state, ready, unsupported } = conversation;
  // Offered only under the message they answer: the planner's last word, with
  // nothing sent since. A question has answers to tap; a choice has cards.
  const latest = messages.at(-1)?.role === "planner";
  const answers = latest ? (conversation.suggestions ?? []) : [];
  const options = latest ? (conversation.options ?? []) : [];
  const turns = messages.filter((m) => m.role === "traveller").length;
  const talkedOut = turns >= INTAKE_MAX_TURNS;
  const answered = messages.some((m) => m.role === "planner");
  // A trip with no place of the traveller's own would be built on the default
  // route, which nobody asked for.
  const placed = state.said.includes("places");
  // A place the planner could not take is a reason the trip cannot be done as
  // asked, with the reason said when it is a known one.
  const verdict = useMemo(
    () => assessAsked(state.constraints, unsupported),
    [state.constraints, unsupported],
  );
  const sketch = useMemo(
    () => sketchTrip(state.constraints),
    [state.constraints],
  );

  const update = (next: Conversation) => {
    setConversation(next);
    keep(next);
  };

  const send = async (raw: string, from: Conversation = conversation) => {
    const said = raw.trim().slice(0, INTAKE_MAX_CHARS);
    if (!said || waiting) return;
    const asked: IntakeMessage[] = [
      ...from.messages,
      { role: "traveller", text: said },
    ];
    setText("");
    setError(null);
    setWaiting(true);
    setConversation({ ...from, messages: asked });
    try {
      const turn = await takeTurn(from.state, asked);
      update({
        messages: [...asked, { role: "planner", text: turn.reply }],
        state: turn.state,
        ready: turn.ready,
        unsupported: turn.unsupported,
        suggestions: turn.suggestions,
        options: turn.options,
      });
    } catch (e) {
      // Unsent: the words go back in the box rather than into a transcript
      // nobody answered.
      setConversation(from);
      setText(said);
      setError((e as Error).message);
    } finally {
      setWaiting(false);
    }
  };

  // Once, on arrival. A sentence from the landing page starts a new
  // conversation and leaves the address, so a reload restores it instead of
  // sending it again; otherwise the tab's conversation, if it has one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initial?.trim()) {
      forgetConversation();
      router.replace("/new");
      void send(initial);
      return;
    }
    const kept = restore();
    if (kept) setConversation(kept);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: follows the transcript
  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, waiting]);

  // Choosing the places by hand settles them: what was refused is no longer
  // being asked for.
  const edit = (patch: Partial<Constraints>) =>
    update({
      ...conversation,
      state: applyEdit(state, patch),
      unsupported: "places" in patch ? [] : unsupported,
    });

  // A card taken is the planner's change, made, and the traveller's answer,
  // said: the next turn starts from the request with it applied.
  const pick = (option: IntakeOption) =>
    void send(option.title, {
      ...conversation,
      state: applyEdit(state, option.patch),
      options: [],
    });

  const build = () =>
    verdict.possible &&
    placed &&
    router.push(
      `/new/building?c=${encodeConstraints(state.constraints)}&r=${crypto.randomUUID()}`,
    );

  // The suggestions are a list of their own, to the right of the conversation
  // on a wide screen and under its opening on a phone. One starts a
  // conversation; once there is one, it goes into the box to be sent or changed.
  const suggestions = (
    <>
      <Eyebrow>Try one of these</Eyebrow>
      <div className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap lg:items-start">
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            disabled={waiting || talkedOut}
            onClick={() =>
              messages.length === 0 ? void send(example) : setText(example)
            }
          >
            <Chip className="h-auto min-h-7 cursor-pointer rounded-2xl py-1 text-left hover:border-control">
              {example}
            </Chip>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex w-full min-w-0 max-w-[820px] flex-1 flex-col gap-4">
        <div role="log" aria-live="polite" className="flex flex-col gap-3">
          <PlannerSays>{OPENING}</PlannerSays>

          {messages.length === 0 && !waiting ? (
            <div className="flex flex-col gap-2 pl-[27px] lg:hidden">
              {suggestions}
            </div>
          ) : null}

          {messages.map((m, i) =>
            m.role === "traveller" ? (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: a transcript only grows
                key={i}
                className="max-w-[85%] self-end whitespace-pre-wrap rounded-card border border-hairline bg-surface-subtle px-3.5 py-2.5 text-small"
              >
                {m.text}
              </div>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: a transcript only grows
              <PlannerSays key={i}>{m.text}</PlannerSays>
            ),
          )}

          {waiting ? <PlannerSays faint>Thinking…</PlannerSays> : null}

          {answers.length && !waiting && !talkedOut ? (
            <div className="flex flex-wrap gap-2 pl-[27px]">
              {answers.map((answer) => (
                <button
                  key={answer}
                  type="button"
                  onClick={() => void send(answer)}
                >
                  <Chip className="cursor-pointer hover:border-control">
                    {answer}
                  </Chip>
                </button>
              ))}
            </div>
          ) : null}

          {options.length && !waiting && !talkedOut ? (
            <div className="pl-[27px]">
              <OptionCards options={options} onPick={pick} />
            </div>
          ) : null}
        </div>

        {answered ? (
          <div className="flex flex-col gap-3 lg:pl-[27px]">
            <TripSketchCard
              // Put down again whenever the trip changes: the card is the
              // planner's latest word on it, not a form that edits in place.
              key={JSON.stringify(state.constraints)}
              constraints={state.constraints}
              sketch={sketch}
              said={(k) => (state.said as (keyof Constraints)[]).includes(k)}
              blockers={reasons(verdict)}
              ready={ready}
              onInterests={(interests) => edit({ interests })}
            >
              {state.constraints.notes ? (
                <p className="text-mini text-ink-muted">
                  <span className="font-medium text-ink">Keeping in mind:</span>{" "}
                  {state.constraints.notes}{" "}
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        ...conversation,
                        state: {
                          ...state,
                          constraints: { ...state.constraints, notes: "" },
                        },
                      })
                    }
                    className="font-medium text-agent"
                  >
                    Clear
                  </button>
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                  variant={ready ? "primary" : "secondary"}
                  className="px-5 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={waiting || !verdict.possible || !placed}
                  onClick={build}
                >
                  {ready ? "Looks right — plan every day" : "Plan it as it is"}
                </Button>
                <QuietAction
                  aria-expanded={details}
                  onClick={() => setDetails(!details)}
                >
                  {details ? "Hide the details" : "Correct the details"}
                </QuietAction>
              </div>
              <span className="text-mini text-ink-faint">
                {!verdict.possible
                  ? "Put the red part right first, or tell me what to change."
                  : !placed
                    ? "Tell me where in Georgia first, or choose it in the details."
                    : ready
                      ? "Builds every day, stop by stop, for you to edit. Takes up to a minute."
                      : "Anything not yet said is assumed. Keep talking, or plan it now."}
              </span>
            </TripSketchCard>
            {details || !verdict.possible ? (
              <ConstraintCards
                constraints={state.constraints}
                said={(k) => (state.said as (keyof Constraints)[]).includes(k)}
                verdict={verdict}
                onChange={edit}
                today={today}
              />
            ) : null}
          </div>
        ) : null}

        <Card className="flex flex-col gap-2 rounded-[16px] p-3 shadow-lifted lg:p-4">
          <div className="flex items-end gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                talkedOut
                  ? "Correct a card above, or build the trip"
                  : answered
                    ? "Reply, or change anything"
                    : "7 days in Georgia, €700, nature and monasteries, with my father"
              }
              aria-label="Message the planner"
              rows={2}
              maxLength={INTAKE_MAX_CHARS}
              disabled={talkedOut}
              // biome-ignore lint/a11y/noAutofocus: the page is this box
              autoFocus
              onKeyDown={(e) => {
                // Enter sends, except mid-composition (an IME's Enter picks a
                // candidate) and on a touch keyboard, where Enter is the only
                // way to a new line and the button is the way to send.
                if (
                  e.key !== "Enter" ||
                  e.shiftKey ||
                  e.nativeEvent.isComposing ||
                  window.matchMedia("(pointer: coarse)").matches
                ) {
                  return;
                }
                e.preventDefault();
                void send(text);
              }}
              className="w-full flex-1 resize-none bg-transparent text-[15px] leading-[1.5] outline-none placeholder:text-ink-faint"
            />
            <button
              type="button"
              aria-label="Send"
              disabled={waiting || talkedOut || !text.trim()}
              onClick={() => void send(text)}
              className="flex size-[38px] shrink-0 items-center justify-center rounded-control bg-agent text-on-accent transition-colors hover:bg-agent-hover disabled:opacity-50"
            >
              <Icon
                name="arrowRight"
                size={15}
                strokeWidth={1.8}
                className="-rotate-90"
              />
            </button>
          </div>
          {error ? (
            <p className="text-mini text-alert">{error}</p>
          ) : (
            <p className="hidden text-mini text-ink-faint lg:block">
              {talkedOut
                ? "We have talked this one through. The cards are yours to correct."
                : "Enter to send · Shift+Enter for a new line"}
            </p>
          )}
        </Card>
        <div ref={end} />
      </div>
      <aside className="hidden w-[240px] shrink-0 flex-col gap-2 border-l border-hairline pl-5 lg:flex">
        {suggestions}
      </aside>
    </div>
  );
}

function PlannerSays({
  children,
  faint = false,
}: {
  children: React.ReactNode;
  faint?: boolean;
}) {
  return (
    <div className="flex max-w-[92%] items-start gap-3">
      <Icon name="sparkle" size={15} className="mt-[3px] shrink-0 text-agent" />
      <p
        className={cx(
          "whitespace-pre-wrap text-small",
          faint ? "text-ink-faint" : "text-ink",
        )}
      >
        {children}
      </p>
    </div>
  );
}
