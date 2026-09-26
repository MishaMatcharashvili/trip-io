"use client";

import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/hono-client";
import { Chip } from "@/ui/chip";
import { cx } from "@/ui/cx";
import { Icon } from "@/ui/icon";
import { Eyebrow } from "@/ui/text";

/**
 * The way you talk back. It sits at the bottom of the map on desktop and
 * inside the sheet on mobile — the same input either way. With a trip it
 * answers questions about that trip, from that trip (src/bll/ask.ts); it never
 * changes the plan, and says where a change would be made.
 */

type Exchange = {
  question: string;
  answer: string | null;
  grounded: boolean;
  failed?: boolean;
};

export function CommandBar({
  tripId,
  initialQuestion,
  suggestions = [],
  placeholder = "Ask about your trip",
  compact = false,
  className,
}: {
  /** The trip questions are about. Without one the bar is the reference render's. */
  tripId?: string;
  /** Asked as the bar mounts: "Ask about it" from a stop lands here. */
  initialQuestion?: string;
  suggestions?: string[];
  placeholder?: string;
  compact?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const asked = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  const ask = async (question: string) => {
    const q = question.trim();
    if (!tripId || q.length < 2) return;
    setValue("");
    setExchange({ question: q, answer: null, grounded: true });
    const res = await apiClient.api.trips[":id"].ask.$post({
      param: { id: tripId },
      json: { question: q },
    });
    if (res.ok) {
      const body = (await res.json()) as { answer: string; grounded: boolean };
      setExchange({
        question: q,
        answer: body.answer,
        grounded: body.grounded,
      });
    } else {
      setExchange({
        question: q,
        answer: "I couldn’t answer that just now. Try again in a moment.",
        grounded: false,
        failed: true,
      });
    }
  };

  // Asked once, on mount — and only by the bar that is showing: the desktop
  // and phone layouts both render one, and one question is one answer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked once, on mount
  useEffect(() => {
    const visible = root.current?.offsetParent !== null;
    if (initialQuestion && visible && !asked.current) {
      asked.current = true;
      void ask(initialQuestion);
    }
  }, []);

  return (
    <div
      ref={root}
      className={cx("flex flex-col items-center gap-2.5", className)}
    >
      {exchange ? (
        <div className="w-full rounded-panel border border-hairline-strong bg-surface px-4 py-3 shadow-panel">
          <div className="flex items-start gap-2">
            <Eyebrow className="flex-1 truncate">{exchange.question}</Eyebrow>
            <button
              type="button"
              aria-label="Close the answer"
              onClick={() => setExchange(null)}
              className="text-ink-faint hover:text-ink"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          {exchange.answer === null ? (
            <p className="pt-1.5 text-small text-ink-faint">Thinking…</p>
          ) : (
            <p
              className={cx(
                "max-h-[180px] overflow-y-auto pt-1.5 text-small",
                exchange.failed ? "text-alert" : "text-ink",
              )}
            >
              {exchange.answer}
            </p>
          )}
          {exchange.answer !== null &&
          !exchange.grounded &&
          !exchange.failed ? (
            <p className="pt-1 text-mini text-ink-faint">
              Your plan didn’t hold what that needed, so this is general.
            </p>
          ) : null}
        </div>
      ) : null}

      {suggestions.length > 0 && !exchange ? (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => (tripId ? ask(s) : setValue(s))}
            >
              <Chip floating className="cursor-pointer hover:border-control">
                {s}
              </Chip>
            </button>
          ))}
        </div>
      ) : null}

      <form
        className={cx(
          "flex w-full items-center gap-3 rounded-panel border bg-surface pl-4 pr-1.5",
          compact
            ? "h-[46px] border-hairline bg-surface-subtle pr-1.5"
            : "h-[50px] border-hairline-strong shadow-panel",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(value);
        }}
      >
        <Icon name="sparkle" size={17} className="text-agent" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          maxLength={300}
          className="h-full flex-1 bg-transparent text-title outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={exchange?.answer === null}
          className={cx(
            "flex items-center justify-center rounded-control bg-agent text-on-accent transition-colors hover:bg-agent-hover disabled:opacity-60",
            compact ? "size-[34px] rounded-[9px]" : "size-[38px]",
          )}
        >
          <Icon
            name="arrowRight"
            size={15}
            strokeWidth={1.8}
            className="-rotate-90"
          />
        </button>
      </form>
    </div>
  );
}
