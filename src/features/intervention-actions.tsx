"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { apiClient } from "@/lib/hono-client";
import { Button, QuietAction } from "@/ui/button";

/**
 * The card's three answers. Each is one request that either records the
 * outcome or says why it could not — then the page is re-read from the server,
 * because the card's truth is the database row, not this component's memory of
 * having been tapped.
 */

type Answer = "accept" | "dismiss" | "mute";

const REFUSALS: Record<string, string> = {
  "already-answered": "This was already answered on another device.",
  "no-longer-applies":
    "Your plan has changed since this was suggested, so it can’t be applied as it was.",
  "nothing-to-apply": "There’s nothing to apply here.",
};

export function InterventionActions({
  id,
  canApply,
  allowMute,
}: {
  id: string;
  canApply: boolean;
  /** Only a push can be muted: the briefing is the channel that stays. */
  allowMute: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const send = (answer: Answer) =>
    startTransition(async () => {
      setError(null);
      const res = await apiClient.api.interventions[":id"][":answer"].$post({
        param: { id, answer },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          messages?: string[];
        } | null;
        setError(
          body?.messages?.[0] ??
            REFUSALS[body?.error ?? ""] ??
            "That didn’t go through. Try again in a moment.",
        );
      }
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-2.5">
      {canApply ? (
        <Button
          variant="primary"
          size="lg"
          block
          disabled={pending}
          onClick={() => send("accept")}
        >
          Apply change
        </Button>
      ) : null}
      <Button
        size="lg"
        block
        disabled={pending}
        onClick={() => send("dismiss")}
      >
        Keep current plan
      </Button>
      {allowMute ? (
        <QuietAction
          className="self-center"
          disabled={pending}
          onClick={() => send("mute")}
        >
          Don’t interrupt me on this trip
        </QuietAction>
      ) : null}
      {error ? (
        <p role="alert" className="text-center text-mini text-ink-muted">
          {error}
        </p>
      ) : null}
    </div>
  );
}
