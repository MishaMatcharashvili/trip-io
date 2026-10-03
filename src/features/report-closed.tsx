"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiClient } from "@/lib/hono-client";
import { Eyebrow } from "@/ui/text";

// "This place is shut" — detector #5's only input. One tap, no free text. A
// curator's report goes live at once; a traveller's waits for a second
// traveller to say the same, which the answer explains rather than hiding.

type Answer =
  | { kind: "published" }
  | { kind: "waiting" }
  | { kind: "again" }
  | { kind: "error"; message: string };

const SAYS: Record<Answer["kind"], string> = {
  published: "Thank you. I'm checking the trips that include it.",
  waiting:
    "Thank you. I'll tell other trips once a second traveller says the same.",
  again: "You've already told me about this one.",
  error: "",
};

export function ReportClosed({
  placeId,
  name,
  date,
  dateLabel,
}: {
  placeId: string;
  name: string;
  /** The Tbilisi day of the stop, YYYY-MM-DD. */
  date: string;
  /** "today", "tomorrow", "Thu 8 Oct": how the button names the day. */
  dateLabel: string;
}) {
  const router = useRouter();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [pending, start] = useTransition();

  const send = () =>
    start(async () => {
      const res = await apiClient.api.places[":id"].closed.$post({
        param: { id: placeId },
        json: { date },
      });
      if ((res.status as number) === 401) {
        router.push(
          `/sign-in?next=${encodeURIComponent(window.location.pathname)}`,
        );
        return;
      }
      const body = (await res.json().catch(() => null)) as {
        status?: string;
        error?: string;
        reason?: string;
      } | null;
      if (res.ok && body?.status === "published")
        setAnswer({ kind: "published" });
      else if (res.ok && body?.status === "waiting")
        setAnswer({ kind: "waiting" });
      else if (res.ok) setAnswer({ kind: "again" });
      else if (body?.error === "sign-in-required") {
        setAnswer({
          kind: "error",
          message: "Sign in with an account to report. Guest sessions can't.",
        });
      } else {
        setAnswer({
          kind: "error",
          message: "I couldn't send that. Try again.",
        });
      }
    });

  return (
    <div className="flex flex-col gap-2 border-b border-hairline px-[18px] py-3.5">
      <Eyebrow>Is it shut?</Eyebrow>
      {answer ? (
        <p role="status" className="text-small text-ink-muted">
          {answer.kind === "error" ? answer.message : SAYS[answer.kind]}
        </p>
      ) : (
        <button
          type="button"
          onClick={send}
          disabled={pending}
          className="self-start text-small font-medium text-ink-muted underline decoration-hairline-strong underline-offset-4 hover:text-ink disabled:opacity-60"
        >
          Report {name} closed {dateLabel}
        </button>
      )}
    </div>
  );
}
