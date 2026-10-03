"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiClient } from "@/lib/hono-client";
import { Button, ButtonLink } from "@/ui/button";
import { Card } from "@/ui/card";
import { Icon } from "@/ui/icon";
import { Eyebrow } from "@/ui/text";
import { UndoButton } from "./trip-actions";

// Ways to change this stop: another time, another length, another place. The
// rules build and check every option against the day; a model chooses among them
// and says why when it can (src/bll/suggestions.ts). Nothing is applied until the
// traveller taps one, and then it goes through the same patch route as an edit
// of their own — one change, one undo — so the screen says what each would change
// and what else it would move before it is tapped, not after.

type Suggestion = {
  id: string;
  title: string;
  reason: string;
  changes: string[];
  moves: string[];
  ops: unknown[];
};

type Answer =
  | { status: "idle" }
  | { status: "asking" }
  | { status: "shown"; source: "ai" | "rules"; items: Suggestion[] }
  | { status: "failed"; text: string }
  // One was applied; the rest were worked out against a plan that has changed.
  | { status: "applied"; title: string };

export function StopSuggestions({
  tripId,
  nodeId,
  head,
  editHref,
}: {
  tripId: string;
  nodeId: string;
  /** The patch the page was read at: what an applied suggestion is a change to. */
  head: string | null;
  /** Where to change it by hand, in the day. */
  editHref: string;
}) {
  const router = useRouter();
  const [wish, setWish] = useState("");
  const [answer, setAnswer] = useState<Answer>({ status: "idle" });
  const [applying, startApplying] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setError(null);
    setAnswer({ status: "asking" });
    try {
      const res = await apiClient.api.trips[":id"].suggest.$post({
        param: { id: tripId },
        json: { nodeId, wish: wish.trim() || undefined },
      });
      if (res.status === 429) {
        return setAnswer({
          status: "failed",
          text: "That is a lot of asking. Try again in a minute.",
        });
      }
      if (!res.ok) {
        return setAnswer({
          status: "failed",
          text: "I couldn’t come up with suggestions just now.",
        });
      }
      const body = (await res.json()) as {
        ok: true;
        source: "ai" | "rules";
        suggestions: Suggestion[];
      };
      setAnswer({
        status: "shown",
        source: body.source,
        items: body.suggestions,
      });
    } catch {
      setAnswer({
        status: "failed",
        text: "I couldn’t reach the planner. Check your connection.",
      });
    }
  }

  function apply(item: Suggestion) {
    setError(null);
    startApplying(async () => {
      const res = await apiClient.api.trips[":id"].patches.$post({
        param: { id: tripId },
        json: { parentId: head, intent: item.title, ops: item.ops as never },
      });
      if (res.ok) {
        setAnswer({ status: "applied", title: item.title });
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        body?.error === "stale"
          ? "Your plan changed since these were worked out. Ask again."
          : "That change didn’t go through.",
      );
    });
  }

  return (
    <section
      aria-label="Change this stop"
      className="flex flex-col gap-3 border-b border-hairline px-[18px] py-3.5"
    >
      <div className="flex items-center gap-2">
        <Icon name="sparkle" size={14} className="text-agent" />
        <Eyebrow>Change this stop</Eyebrow>
        <div className="flex-1" />
        <ButtonLink href={editHref} size="sm" variant="ghost">
          Edit by hand
        </ButtonLink>
      </div>

      {answer.status === "applied" ? (
        <div className="flex items-center gap-3 rounded-control bg-ok-tint px-3 py-2.5">
          <Icon name="check" size={14} className="text-ok" />
          <span className="flex-1 text-small">Done: {answer.title}.</span>
          <UndoButton tripId={tripId} />
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <div className="flex gap-2">
            <input
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              maxLength={200}
              placeholder="Anything in mind? “somewhere indoors”, “later”"
              aria-label="What would you like to change?"
              className="h-10 min-w-0 flex-1 rounded-control border border-control bg-surface px-3 text-small outline-none placeholder:text-ink-faint focus:border-agent"
            />
            <Button
              type="submit"
              size="md"
              disabled={answer.status === "asking"}
            >
              {answer.status === "asking" ? "Thinking…" : "Suggest"}
            </Button>
          </div>
        </form>
      )}

      {answer.status === "failed" ? (
        <p className="text-small text-alert">{answer.text}</p>
      ) : null}

      {answer.status === "shown" && answer.items.length === 0 ? (
        <p className="text-small text-ink-muted">
          Nothing that holds up against the rest of your day. You can still
          change it by hand.
        </p>
      ) : null}

      {answer.status === "shown" && answer.items.length > 0 ? (
        <>
          <ul className="flex flex-col gap-2.5">
            {answer.items.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-col gap-2 px-3.5 py-3">
                  <div className="text-small font-semibold">{item.title}</div>
                  <p className="text-small text-ink-muted">{item.reason}</p>
                  <ul className="flex flex-col gap-0.5">
                    {item.changes.map((change) => (
                      <li key={change} className="text-mini text-ink">
                        {change}
                      </li>
                    ))}
                    {item.moves.map((move) => (
                      <li key={move} className="text-mini text-ink-faint">
                        Also moves {move}
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2 pt-0.5">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={applying}
                      onClick={() => apply(item)}
                    >
                      {applying ? "Applying…" : "Do this"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={applying}
                      onClick={() =>
                        setAnswer({
                          status: "shown",
                          source: answer.source,
                          items: answer.items.filter((i) => i.id !== item.id),
                        })
                      }
                    >
                      Not that
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
          <p className="text-mini text-ink-faint">
            {answer.source === "ai"
              ? "Chosen by the AI from changes already checked against your day. Nothing happens until you tap one."
              : "Changes checked against your day. Nothing happens until you tap one."}
          </p>
        </>
      ) : null}

      {error ? <p className="text-small text-alert">{error}</p> : null}
    </section>
  );
}
