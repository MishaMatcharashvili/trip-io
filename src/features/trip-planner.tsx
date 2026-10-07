"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Constraints } from "@/domain/trip/generate/constraints";
import {
  applyEdit,
  INTAKE_MAX_CHARS,
  INTAKE_MAX_TURNS,
  type IntakeMessage,
  type IntakeState,
  initialState,
} from "@/domain/trip/generate/intake";
import { withGuestSession } from "@/lib/guest-session";
import { apiClient } from "@/lib/hono-client";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { ConstraintCards } from "./constraint-cards";
import {
  encodeConstraints,
  forgetConversation,
  PLANNER_STORAGE_KEY,
} from "./new-trip";

// The conversation on /new. The traveller writes, the planner replies
// (src/bll/intake.ts) and shows what it holds as cards under its latest
// message. Sending a message never builds anything: the trip is built by the
// one button under the cards, and only by it.

type Conversation = {
  messages: IntakeMessage[];
  state: IntakeState;
  /** The planner has nothing left to ask. */
  ready: boolean;
};

type Reply = {
  ok: true;
  reply: string;
  state: IntakeState;
  ready: boolean;
};

const OPENING =
  "Tell me about the trip you have in mind: where in Georgia, how long, who is coming and what you like. I will ask about what is missing, and nothing is built until you say so.";

function restore(): Conversation | null {
  try {
    const raw = sessionStorage.getItem(PLANNER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Conversation) : null;
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
  const body = (await res.json().catch(() => null)) as Reply | null;
  if (!res.ok || !body?.ok) {
    throw new Error("I couldn’t reply just now. Try sending that again.");
  }
  return body;
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
  const started = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  const { messages, state, ready } = conversation;
  const turns = messages.filter((m) => m.role === "traveller").length;
  const talkedOut = turns >= INTAKE_MAX_TURNS;
  const answered = messages.some((m) => m.role === "planner");

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

  const edit = (patch: Partial<Constraints>) =>
    update({ ...conversation, state: applyEdit(state, patch) });

  const build = () =>
    router.push(
      `/new/building?c=${encodeConstraints(state.constraints)}&r=${crypto.randomUUID()}`,
    );

  return (
    <div className="flex w-full max-w-[820px] flex-col gap-4">
      <div role="log" aria-live="polite" className="flex flex-col gap-3">
        <PlannerSays>{OPENING}</PlannerSays>

        {messages.length === 0 && !waiting ? (
          <div className="flex flex-wrap gap-2 pl-[27px]">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => void send(example)}
              >
                <Chip className="h-auto min-h-7 cursor-pointer rounded-2xl py-1 text-left hover:border-control">
                  {example}
                </Chip>
              </button>
            ))}
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
      </div>

      {answered ? (
        <div className="flex flex-col gap-3 lg:pl-[27px]">
          <ConstraintCards
            constraints={state.constraints}
            said={(k) => (state.said as (keyof Constraints)[]).includes(k)}
            onChange={edit}
            today={today}
          />
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
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              className="px-5"
              disabled={waiting}
              onClick={build}
            >
              Build this trip
            </Button>
            <span className="text-mini text-ink-faint">
              {ready
                ? "Builds from the cards above. Takes up to a minute."
                : "You can build now with what is assumed, or keep talking."}
            </span>
          </div>
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
